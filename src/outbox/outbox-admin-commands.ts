import type { DatabaseSync } from "node:sqlite";
import type { AppEnv } from "../config/env-schema.js";
import { formatLocalTime } from "../mcp/format-messages-for-model.js";
import { escapeForTerminal } from "../shared/terminal-safe-text.js";
import { findThread } from "../storage/message-read-queries.js";
import { approveDraft, cancelOutboxItem, getOutboxItem, listOutbox, rejectDraft, type OutboxStatus } from "../storage/outbox-store.js";
import { getKillSwitch, setKillSwitch } from "../storage/send-control-store.js";
import { getSendSettings } from "../storage/send-settings-store.js";

/**
 * Lệnh quản trị hàng đợi gửi ở terminal - bản rút gọn của trang Hàng đợi trên
 * dashboard, để thao tác nhanh (nhất là khóa khẩn cấp) khi không mở web.
 */
export type AdminIo = { print: (line: string) => void };
export type AdminContext = { db: DatabaseSync; env: AppEnv; io: AdminIo };

const USAGE = `Cách dùng: pnpm outbox <lệnh>
  list [status]          xem hàng đợi (draft|approved|sending|sent|failed|cancelled|rejected)
  show <id>              xem đầy đủ một mục
  approve <id> [id...]   duyệt nháp để gửi
  reject <id>            từ chối nháp
  cancel <id>            hủy nháp hoặc tin chờ gửi
  kill [lý do]           KHÓA mọi lần gửi ngay
  unkill                 mở khóa gửi
  status                 trạng thái cổng gửi`;

function describeItem(ctx: AdminContext, id: number): string | null {
  const item = getOutboxItem(ctx.db, id);
  if (!item) return null;
  const tz = ctx.env.ARCHIVE_TIMEZONE;
  // Chữ do model/người khác soạn được thoát ký tự điều khiển: hiện ĐÚNG thứ sẽ gửi
  const name = escapeForTerminal(findThread(ctx.db, item.threadId)?.name ?? "(chưa rõ tên)");
  return [
    `#${item.id} [${item.status}${item.mode === "batch" ? ", lô" : ""}] tới ${name} (thread_id=${item.threadId}, ${item.threadType})`,
    `  tạo bởi ${item.createdBy} lúc ${formatLocalTime(item.createdAt, tz)}${item.notBefore ? `, hẹn ${formatLocalTime(item.notBefore, tz)}` : ""}`,
    item.note ? `  ghi chú: ${escapeForTerminal(item.note)}` : null,
    `  nội dung (${item.text.length} ký tự): ${escapeForTerminal(item.text)}`,
    item.error ? `  lỗi: ${escapeForTerminal(item.error)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runOutboxAdminCommand(ctx: AdminContext, argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const { db, io } = ctx;
  const id = Number(rest[0]);
  const validId = Number.isInteger(id) && id > 0;

  switch (cmd) {
    case "list": {
      const status = rest[0] as OutboxStatus | undefined;
      const items = listOutbox(db, { statuses: status ? [status] : undefined, limit: 50 });
      io.print(items.length ? items.map((i) => describeItem(ctx, i.id)).join("\n") : "Hàng đợi trống.");
      return 0;
    }
    case "show":
      if (!validId) return (io.print("Thiếu hoặc sai <id>."), 1);
      io.print(describeItem(ctx, id) ?? `Không có #${id}.`);
      return 0;
    case "approve": {
      const ids = rest.map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length === 0) return (io.print("Thiếu <id>."), 1);
      for (const i of ids) io.print(approveDraft(db, i) ? `Đã duyệt #${i}.` : `#${i} không ở trạng thái draft - bỏ qua.`);
      return 0;
    }
    case "reject":
      if (!validId) return (io.print("Thiếu hoặc sai <id>."), 1);
      io.print(rejectDraft(db, id) ? `Đã từ chối #${id}.` : `#${id} không phải nháp.`);
      return 0;
    case "cancel":
      if (!validId) return (io.print("Thiếu hoặc sai <id>."), 1);
      io.print(cancelOutboxItem(db, id) ? `Đã hủy #${id}.` : `#${id} không hủy được (không ở draft/approved).`);
      return 0;
    case "kill":
      setKillSwitch(db, true, rest.join(" ") || "người dùng khóa tay");
      io.print("Đã KHÓA mọi lần gửi.");
      return 0;
    case "unkill":
      setKillSwitch(db, false, null);
      io.print("Đã mở khóa gửi.");
      return 0;
    case "status": {
      const k = getKillSwitch(db);
      const s = getSendSettings(db, ctx.env);
      io.print(`Kill switch: ${k.killed ? `KHÓA (${k.reason})` : "mở"} từ ${formatLocalTime(k.changedAt, ctx.env.ARCHIVE_TIMEZONE)}`);
      io.print(
        `Tin lẻ: cách nhau >= ${s.singleMinGapSeconds}s. Lô: ${s.batchMinGapSeconds}-${s.batchMaxGapSeconds}s, ` +
          `${s.batchWindowStartHour}h-${s.batchWindowEndHour}h, tối đa ${s.batchDailyCap} tin/ngày.`,
      );
      return 0;
    }
    default:
      io.print(USAGE);
      return cmd ? 1 : 0;
  }
}
