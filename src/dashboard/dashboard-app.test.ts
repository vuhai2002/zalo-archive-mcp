import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { markAttachmentDone } from "../storage/attachment-queue-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { getKillSwitch } from "../storage/send-control-store.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

/** Dashboard có mật khẩu, một nick "test" đang dùng, kho có một tin kèm ảnh */
async function setup() {
  const h = await createDashboardHarness();
  const { db, paths } = h.nick("test");
  upsertMessage(
    db,
    sampleMessage({ attachments: [{ kind: "photo", remoteUrl: "https://f1.zdn.vn/a.jpg", fileName: null, declaredSize: null }] }),
    { source: "live", receivedAt: "2026-10-28T03:00:00.000Z" },
  );
  return { ...h, db, paths };
}

async function login(s: Awaited<ReturnType<typeof setup>>): Promise<string> {
  return s.login();
}

describe("dashboard API", () => {
  it("sai mật khẩu 401; chưa đăng nhập thì mọi route khác 401; đăng nhập rồi thì vào được", async () => {
    const s = await setup();
    assert.equal((await s.call("/api/auth/login", s.json({ password: "sai" }))).status, 401);
    assert.equal((await s.call("/api/threads")).status, 401);
    const cookie = await login(s);
    assert.match(cookie, /HttpOnly|zam_session=/);
    const res = await s.call("/api/threads", { cookie });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { total: number }).total, 1);
    assert.equal((await s.call("/api/auth/me", { cookie })).status, 200);
  });

  it("Host lạ bị chặn (chống DNS rebinding); route ghi không phải JSON bị chặn", async () => {
    const s = await setup();
    assert.equal((await s.call("/api/auth/me", { host: "evil.example:3210" })).status, 403);
    const cookie = await login(s);
    const form = await s.call("/api/kill-switch", { method: "POST", cookie, body: "killed=true", headers: { "content-type": "application/x-www-form-urlencoded" } });
    assert.equal(form.status, 415);
  });

  it("gửi ngay từ dashboard: tạo tin lẻ đã duyệt; nội dung trống bị 400", async () => {
    const s = await setup();
    const cookie = await login(s);
    const ok = await s.call("/api/outbox", { ...s.json({ threadId: "u-lan", text: "Chào", when: "now" }), cookie });
    assert.equal(ok.status, 200);
    const item = (await ok.json()) as { status: string; mode: string; createdBy: string };
    assert.deepEqual([item.status, item.mode, item.createdBy], ["approved", "single", "dashboard"]);
    assert.equal((await s.call("/api/outbox", { ...s.json({ threadId: "u-lan", text: " ", when: "now" }), cookie })).status, 400);
  });

  it("cài đặt: lưu được, sai thì 400; khóa khẩn cấp bật/tắt", async () => {
    const s = await setup();
    const cookie = await login(s);
    const put = (body: unknown) => s.call("/api/settings", { ...s.json(body), method: "PUT", cookie });
    assert.equal((await put({ singleMinGapSeconds: 10 })).status, 200);
    assert.equal((await put({ batchMinGapSeconds: 300, batchMaxGapSeconds: 100 })).status, 400);
    await s.call("/api/kill-switch", { ...s.json({ killed: true, reason: "thử" }), cookie });
    assert.equal(getKillSwitch(s.db).killed, true);
  });

  it("route /api lạ trả 404 JSON (không rơi xuống trang SPA), URL hỏng trả 400, limit lẻ không lỗi", async () => {
    const s2 = await setup();
    const cookie = await login(s2);
    const nope = await s2.call("/api/khong-co", { cookie });
    assert.equal(nope.status, 404);
    assert.match(nope.headers.get("content-type") ?? "", /json/);
    assert.equal((await s2.call("/%E0%A4%A")).status, 400);
    assert.equal((await s2.call("/api/outbox?limit=1.5", { cookie })).status, 200);
  });

  it("media: chỉ phục vụ file đã tải trong thư mục media, kèm header chống chạy script", async () => {
    const s = await setup();
    const cookie = await login(s);
    assert.equal((await s.call("/api/media/1", { cookie })).status, 404);
    fs.mkdirSync(path.join(s.paths.mediaDir, "ab"), { recursive: true });
    fs.writeFileSync(path.join(s.paths.mediaDir, "ab", "abc.jpg"), "anh");
    markAttachmentDone(s.db, 1, { localPath: "ab/abc.jpg", sha256: "abc", sizeBytes: 3, mime: "image/jpeg" });
    const res = await s.call("/api/media/1", { cookie });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "anh");
    assert.match(res.headers.get("content-security-policy") ?? "", /sandbox/);
    // Range cho trình phát video tua được
    const part = await s.call("/api/media/1", { cookie, headers: { range: "bytes=1-" } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("content-range"), "bytes 1-2/3");
    assert.equal(await part.text(), "nh");
    assert.equal((await s.call("/api/media/1", { cookie, headers: { range: "bytes=9-" } })).status, 416);
    // Link ảnh kèm dấu nội dung file: hai nick (kho riêng, số đính kèm trùng nhau) hay file tải lại
    // không bao giờ dùng chung một link - trình duyệt không lấy nhầm ảnh cũ trong bộ nhớ đệm
    const thread = (await (await s.call("/api/threads/u-lan/messages", { cookie })).json()) as {
      messages: Array<{ attachments: Array<{ url: string | null }> }>;
    };
    assert.equal(thread.messages[0]!.attachments[0]!.url, "/api/media/1?v=abc");
    assert.equal((await s.call("/api/media/1?v=abc", { cookie })).status, 200);
    s.db.prepare("UPDATE attachments SET local_path = '../../credentials.enc' WHERE id = 1").run();
    assert.equal((await s.call("/api/media/1", { cookie })).status, 404, "không thoát khỏi thư mục media");
  });

  it("Thử lại file tải hỏng: đưa vào hàng xin lại link; file chưa hỏng 409, file lạ 404", async () => {
    const s = await setup();
    const cookie = await login(s);
    const retry = (id: number) => s.call(`/api/attachments/${id}/retry`, { ...s.json({}), cookie });
    assert.equal((await retry(1)).status, 409, "file đang chờ tải thì không cần thử lại");
    assert.equal((await retry(99)).status, 404);
    s.db.prepare("UPDATE attachments SET status = 'failed', last_error = 'HTTP 404', renewed_at = '2026-10-28T04:00:00.000Z'").run();
    const thread = async () =>
      ((await (await s.call("/api/threads/u-lan/messages", { cookie })).json()) as { messages: Array<{ attachments: unknown[] }> })
        .messages[0]!.attachments[0] as { status: string; renewState: string | null };
    assert.deepEqual(await thread().then((a) => [a.status, a.renewState]), ["failed", "gave_up"]);
    assert.equal((await retry(1)).status, 200);
    assert.deepEqual(await thread().then((a) => [a.status, a.renewState]), ["pending", "waiting"]);
  });

  it("ảnh/file của hội thoại cho bảng thông tin: ảnh có giờ gửi; hội thoại lạ 404", async () => {
    const s = await setup();
    const cookie = await login(s);
    const visual = (await (await s.call("/api/threads/u-lan/shared?kind=visual", { cookie })).json()) as {
      items: Array<{ kind: string; sentAt: string; messageId: number; senderName: string | null; reactions: unknown[] }>;
      total: number;
    };
    assert.deepEqual([visual.total, visual.items[0]!.kind, visual.items[0]!.sentAt], [1, "photo", "2026-10-28T03:00:00.000Z"]);
    // Cửa sổ xem ảnh cần tin gốc, người gửi, cảm xúc
    assert.deepEqual([typeof visual.items[0]!.messageId, visual.items[0]!.senderName, visual.items[0]!.reactions], ["number", "Lan", []]);
    const files = (await (await s.call("/api/threads/u-lan/shared?kind=file", { cookie })).json()) as { total: number };
    assert.equal(files.total, 0);
    assert.equal((await s.call("/api/threads/khong-co/shared", { cookie })).status, 404);
  });

  it("tự cập nhật (SSE): báo sẵn sàng, có tin mới thì gửi sự kiện change kèm hội thoại", async () => {
    const s = await setup();
    const cookie = await login(s);
    const res = await s.call("/api/events", { cookie });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let seen = "";
    const readUntil = async (needle: string) => {
      const deadline = Date.now() + 4_000;
      while (!seen.includes(needle) && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += dec.decode(value);
      }
      return seen.includes(needle);
    };
    assert.ok(await readUntil("event: ready"));
    upsertMessage(s.db, sampleMessage({ msgId: "9", threadId: "u-binh", senderId: "u-binh" }), { source: "live", receivedAt: "2026-10-30T01:00:00.000Z" });
    assert.ok(await readUntil("event: change"), "có tin mới thì báo");
    assert.match(seen, /"threadIds":\["u-binh"\]/);
    await reader.cancel();
  });

  it("ghim hội thoại: lên đầu danh sách, có cờ pinned; sai kiểu 400, hội thoại lạ 404", async () => {
    const s = await setup();
    const cookie = await login(s);
    const pin = (id: string, body: unknown) => s.call(`/api/threads/${id}/pin`, { ...s.json(body), cookie });
    assert.equal((await pin("u-lan", { pinned: "có" })).status, 400);
    assert.equal((await pin("khong-co", { pinned: true })).status, 404);
    assert.equal((await pin("u-lan", { pinned: true })).status, 200);
    const list = (await (await s.call("/api/threads", { cookie })).json()) as { threads: Array<{ threadId: string; pinned: boolean }> };
    assert.deepEqual(list.threads.map((t) => [t.threadId, t.pinned]), [["u-lan", true]]);
  });
});
