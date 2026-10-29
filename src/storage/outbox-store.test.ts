import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openArchiveDatabase } from "./open-archive-database.js";
import { countSendAttemptsSince } from "./outbox-send-stats-store.js";
import {
  approveDraft,
  cancelOutboxItem,
  claimForSending,
  enqueueOutboxItem,
  failStuckSending,
  getOutboxItem,
  markSendFailed,
  markSent,
  peekNextDue,
  rejectDraft,
} from "./outbox-store.js";

const draft = (threadId = "u-lan", notBefore: string | null = null) => ({
  threadId,
  threadType: "user" as const,
  text: "Chào",
  notBefore,
  batchId: null,
  createdBy: "mcp" as const,
  mode: "single" as const,
  status: "draft" as const,
  note: null,
});

describe("outbox store", () => {
  it("nháp chưa duyệt không bao giờ tới hạn gửi", () => {
    const db = openArchiveDatabase(":memory:");
    enqueueOutboxItem(db, draft());
    assert.equal(peekNextDue(db, "2099-01-01T00:00:00.000Z"), null);
  });

  it("duyệt rồi mới gửi được; tôn trọng not_before", () => {
    const db = openArchiveDatabase(":memory:");
    const id = enqueueOutboxItem(db, draft("u-lan", "2026-10-28T10:00:00.000Z"));
    assert.equal(approveDraft(db, id), true);
    assert.equal(approveDraft(db, id), false, "duyệt lần hai là không có tác dụng");
    assert.equal(peekNextDue(db, "2026-10-28T09:59:59.000Z"), null);
    assert.equal(peekNextDue(db, "2026-10-28T10:00:00.000Z")?.id, id);
    assert.equal(claimForSending(db, id), true);
    assert.equal(claimForSending(db, id), false, "không giành hai lần");
    markSent(db, id, "777");
    const item = getOutboxItem(db, id)!;
    assert.equal(item.status, "sent");
    assert.equal(item.sentMsgId, "777");
  });

  it("hủy được nháp và mục đã duyệt, không hủy được mục đang gửi; từ chối chỉ áp cho nháp", () => {
    const db = openArchiveDatabase(":memory:");
    const a = enqueueOutboxItem(db, draft());
    const b = enqueueOutboxItem(db, draft());
    const c = enqueueOutboxItem(db, draft());
    approveDraft(db, b);
    approveDraft(db, c);
    claimForSending(db, c);
    assert.equal(cancelOutboxItem(db, a), true);
    assert.equal(cancelOutboxItem(db, b), true);
    assert.equal(cancelOutboxItem(db, c), false);
    assert.equal(rejectDraft(db, b), false);
    assert.equal(claimForSending(db, b), false, "mục đã hủy không giành được");
  });

  it("tiến trình chết giữa lúc gửi: đánh failed, KHÔNG đưa về approved", () => {
    const db = openArchiveDatabase(":memory:");
    const id = enqueueOutboxItem(db, draft());
    approveDraft(db, id);
    claimForSending(db, id);
    assert.equal(failStuckSending(db), 1);
    assert.equal(getOutboxItem(db, id)!.status, "failed");
    assert.equal(peekNextDue(db, "2099-01-01T00:00:00.000Z"), null);
  });

  it("đếm lần thử gửi tính cả mục hỏng sau khi đã gọi Zalo, theo người nhận", () => {
    const db = openArchiveDatabase(":memory:");
    const ids = [enqueueOutboxItem(db, draft("u-a")), enqueueOutboxItem(db, draft("u-a")), enqueueOutboxItem(db, draft("u-b"))];
    for (const id of ids) approveDraft(db, id);
    claimForSending(db, ids[0]!);
    markSent(db, ids[0]!, "1");
    claimForSending(db, ids[1]!);
    markSendFailed(db, ids[1]!, "lỗi mạng");
    const since = "2000-01-01T00:00:00.000Z";
    assert.equal(countSendAttemptsSince(db, since), 2);
    assert.equal(countSendAttemptsSince(db, since, { threadId: "u-a" }), 2);
    assert.equal(countSendAttemptsSince(db, since, { threadId: "u-b" }), 0);
    // Bị chặn trước khi gọi Zalo (approved -> failed) thì không tính vào trần
    markSendFailed(db, ids[2]!, "không trong allowlist");
    assert.equal(countSendAttemptsSince(db, since), 2);
  });
});
