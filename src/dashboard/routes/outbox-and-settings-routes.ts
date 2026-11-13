import { Hono } from "hono";
import { resolveUploads, UploadRejected, type UploadUse } from "../../outbox/dashboard-upload-store.js";
import { enqueueSingle, READ_ONLY_ERROR } from "../../outbox/enqueue-outbox-request.js";
import { recallProblem } from "../../outbox/outbox-recall-loop.js";
import { sweepStagedFiles } from "../../outbox/stage-scheduled-outbox-files.js";
import { requestRecall } from "../../storage/outbox-recall-store.js";
import { sendScheduledNow } from "../../storage/outbox-send-now-store.js";
import type { OutboxFile } from "../../storage/outbox-item-mapping.js";
import {
  approveDraft,
  cancelOutboxItem,
  getOutboxItem,
  listOutbox,
  outboxStatusCounts,
  type OutboxStatus,
} from "../../storage/outbox-store.js";
import { getKillSwitch, setKillSwitch } from "../../storage/send-control-store.js";
import { getSendSettings, updateSendSettings, type SendSettings } from "../../storage/send-settings-store.js";
import type { OutboxListResponse, SendRequest, SettingsResponse } from "../dashboard-api-contract.js";
import type { DashboardContext } from "../dashboard-context.js";
import { toOutboxItemDto } from "../dashboard-dto-mappers.js";

const STATUSES = new Set<OutboxStatus>(["draft", "approved", "sending", "sent", "failed", "cancelled", "rejected"]);

/** Gửi tin từ dashboard, hàng đợi, cài đặt gửi, khóa khẩn cấp */
export function outboxAndSettingsRoutes(ctx: DashboardContext): Hono {
  const app = new Hono();
  const { db, env } = ctx;
  const itemOr404 = (id: number) => getOutboxItem(db, id);

  app.get("/outbox", (c) => {
    // Một hoặc nhiều trạng thái cách bằng dấu phẩy (tab "Lỗi" = failed,rejected); trạng thái lạ bị bỏ, không còn gì = tất cả
    const statuses = (c.req.query("status") ?? "").split(",").filter((s): s is OutboxStatus => STATUSES.has(s as OutboxStatus));
    const limit = Math.min(500, Math.max(1, Math.trunc(Number(c.req.query("limit"))) || 100));
    const items = listOutbox(db, { statuses, limit });
    return c.json({ items: items.map((i) => toOutboxItemDto(db, i)), counts: outboxStatusCounts(db) } satisfies OutboxListResponse);
  });

  app.post("/outbox", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Partial<SendRequest> | null;
    if (!body || typeof body.threadId !== "string" || typeof body.text !== "string") {
      return c.json({ error: "Thiếu threadId hoặc text" }, 400);
    }
    if (body.when !== "now" && body.when !== "schedule" && body.when !== "draft") {
      return c.json({ error: "when phải là now, schedule hoặc draft" }, 400);
    }
    const replyTo = body.replyToMessageId;
    if (replyTo !== undefined && (typeof replyTo !== "number" || !Number.isInteger(replyTo) || replyTo <= 0)) {
      return c.json({ error: "replyToMessageId phải là số tin trong kho" }, 400);
    }
    if (body.uploads !== undefined && !Array.isArray(body.uploads)) return c.json({ error: "uploads phải là danh sách" }, 400);
    let files: OutboxFile[] = [];
    try {
      files = resolveUploads(ctx.paths.outboxFilesDir, (body.uploads ?? []) as UploadUse[]);
    } catch (err) {
      if (err instanceof UploadRejected) return c.json({ error: err.message }, 400);
      throw err;
    }
    const r = enqueueSingle(
      { db, env, readOnly: ctx.readOnly() },
      {
        threadId: body.threadId,
        text: body.text,
        when: body.when,
        sendDate: body.sendDate,
        sendTime: body.sendTime,
        replyToMessageId: replyTo,
        files,
        styles: body.styles,
        createdBy: "dashboard",
      },
    );
    if (!r.ok) return c.json({ error: r.error }, 400);
    // Dọn file của các tin đã gửi xong / file tải lên bỏ dở từ lâu (thư mục mới tải thì được chừa)
    if (files.length > 0) sweepStagedFiles(db, ctx.paths.outboxFilesDir);
    return c.json(toOutboxItemDto(db, itemOr404(r.ids[0]!)!));
  });

  app.get("/outbox/:id", (c) => {
    const item = itemOr404(Number(c.req.param("id")));
    return item ? c.json(toOutboxItemDto(db, item)) : c.json({ error: "Không có mục này" }, 404);
  });

  app.post("/outbox/:id/approve", (c) => {
    if (ctx.readOnly()) return c.json({ error: READ_ONLY_ERROR }, 409);
    const id = Number(c.req.param("id"));
    if (!approveDraft(db, id)) return c.json({ error: "Chỉ duyệt được mục đang là nháp" }, 400);
    return c.json(toOutboxItemDto(db, itemOr404(id)!));
  });

  // Thu hồi tin đã gửi: chỉ ghi yêu cầu, daemon thu hồi bằng phiên Zalo đang chạy (web tự hỏi lại kết quả)
  app.post("/outbox/:id/recall", (c) => {
    if (ctx.readOnly()) return c.json({ error: READ_ONLY_ERROR }, 409);
    const item = itemOr404(Number(c.req.param("id")));
    if (!item) return c.json({ error: "Không có mục này" }, 404);
    const problem = recallProblem(db, item);
    if (problem) return c.json({ error: problem }, 409);
    if (!requestRecall(db, item.id, new Date().toISOString())) return c.json({ error: "Tin này đang chờ thu hồi rồi" }, 409);
    return c.json(toOutboxItemDto(db, itemOr404(item.id)!));
  });

  // Tin lẻ đang hẹn giờ -> gửi ngay: chỉ dời giờ hẹn về bây giờ, daemon gửi ở lượt kế qua cổng gửi như mọi tin
  app.post("/outbox/:id/send-now", (c) => {
    if (ctx.readOnly()) return c.json({ error: READ_ONLY_ERROR }, 409);
    const id = Number(c.req.param("id"));
    if (!sendScheduledNow(db, id)) return c.json({ error: "Chỉ gửi ngay được tin lẻ đang hẹn giờ, chưa tới giờ gửi" }, 400);
    return c.json(toOutboxItemDto(db, itemOr404(id)!));
  });

  app.post("/outbox/:id/cancel", (c) => {
    const id = Number(c.req.param("id"));
    if (!cancelOutboxItem(db, id)) return c.json({ error: "Chỉ hủy được nháp hoặc tin chưa gửi" }, 400);
    return c.json(toOutboxItemDto(db, itemOr404(id)!));
  });

  const settingsResponse = (): SettingsResponse => ({ settings: getSendSettings(db, env), killSwitch: getKillSwitch(db) });

  app.get("/settings", (c) => c.json(settingsResponse()));

  app.put("/settings", async (c) => {
    const patch = (await c.req.json().catch(() => null)) as Partial<SendSettings> | null;
    if (!patch || typeof patch !== "object") return c.json({ error: "Body không hợp lệ" }, 400);
    const r = updateSendSettings(db, env, patch);
    return r.ok ? c.json(settingsResponse()) : c.json({ error: r.error }, 400);
  });

  app.post("/kill-switch", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { killed?: unknown; reason?: unknown } | null;
    if (typeof body?.killed !== "boolean") return c.json({ error: "killed phải là true/false" }, 400);
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : "khóa trên dashboard";
    setKillSwitch(db, body.killed, body.killed ? reason : null);
    return c.json(settingsResponse());
  });

  return app;
}
