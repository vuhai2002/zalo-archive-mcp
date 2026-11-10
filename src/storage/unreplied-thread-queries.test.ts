import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedMessage } from "../archive/archived-message-types.js";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { applyReaction } from "./message-reaction-store.js";
import { upsertMessage } from "./message-write-store.js";
import { MY_DOCUMENTS_META_KEY } from "./my-documents-deletion-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { setMeta } from "./thread-directory-store.js";
import { listUnrepliedThreads } from "./unreplied-thread-queries.js";

const ME = "9001";
const SINCE = "2026-11-01T00:00:00.000Z";
const live = { source: "live" as const, receivedAt: "2026-11-10T00:00:00.000Z" };
let seq = 0;

/** Tin trong hội thoại 1-1 với `peer`; `self` = mình gửi */
function dm(db: ReturnType<typeof openArchiveDatabase>, peer: string, at: string, self: boolean, extra: Partial<NormalizedMessage> = {}) {
  const msgId = String(++seq);
  upsertMessage(
    db,
    sampleMessage({ msgId, cliMsgId: `c${msgId}`, threadId: peer, senderId: self ? ME : peer, senderName: self ? "Tôi" : peer, isSelf: self, sentAt: at, ...extra }),
    live,
  );
  return msgId;
}

function group(db: ReturnType<typeof openArchiveDatabase>, at: string, from: string, raw: object = {}, text = "chào cả nhà") {
  const msgId = String(++seq);
  const self = from === ME;
  upsertMessage(
    db,
    sampleMessage({ msgId, cliMsgId: `c${msgId}`, threadId: "g1", threadType: "group", senderId: from, senderName: from, isSelf: self, sentAt: at, text, rawJson: JSON.stringify(raw) }),
    live,
  );
  return msgId;
}

const call = (action: string, params: object) =>
  ({ msgType: "chat.recommended", text: "", rawJson: JSON.stringify({ content: { action, params: JSON.stringify(params) } }) }) as const;

function freshDb() {
  const db = openArchiveDatabase(":memory:");
  setMeta(db, "self_uid", ME);
  return db;
}

const ids = (db: ReturnType<typeof openArchiveDatabase>) => listUnrepliedThreads(db, { sinceIso: SINCE }).map((t) => t.thread.threadId);

describe("listUnrepliedThreads - 1-1", () => {
  it("tin cuối của người kia thì chờ trả lời (đếm các tin từ lần cuối mình nhắn); mình nhắn cuối thì không", () => {
    const db = freshDb();
    dm(db, "u-lan", "2026-11-05T01:00:00.000Z", true);
    dm(db, "u-lan", "2026-11-05T02:00:00.000Z", false, { text: "anh ơi" });
    dm(db, "u-lan", "2026-11-05T03:00:00.000Z", false, { text: "mai đi không" });
    dm(db, "u-binh", "2026-11-05T01:00:00.000Z", false);
    dm(db, "u-binh", "2026-11-05T02:00:00.000Z", true);
    const [lan, ...rest] = listUnrepliedThreads(db, { sinceIso: SINCE });
    assert.equal(rest.length, 0);
    assert.equal(lan?.thread.threadId, "u-lan");
    assert.deepEqual(lan?.pending.map((p) => p.preview), ["mai đi không", "anh ơi"]);
  });

  it("bỏ qua thiệp sinh nhật / thẻ Zalo; tin treo cũ hơn khoảng hỏi thì không tính", () => {
    const db = freshDb();
    dm(db, "u-sn", "2026-11-05T01:00:00.000Z", true);
    dm(db, "u-sn", "2026-11-06T01:00:00.000Z", false, { msgType: "chat.ecard", text: "Sinh nhật của Sn" });
    dm(db, "u-cu", "2026-10-01T01:00:00.000Z", false, { text: "tin tháng trước" });
    dm(db, "u-cu", "2026-11-06T01:00:00.000Z", false, { msgType: "chat.list.action", text: "Thẻ tin" });
    assert.deepEqual(ids(db), []);
  });

  it("nghe máy là đã phản hồi; cuộc gọi nhỡ thì vẫn chờ", () => {
    const db = freshDb();
    dm(db, "u-goi", "2026-11-05T01:00:00.000Z", false, { text: "gọi em nhé" });
    dm(db, "u-goi", "2026-11-05T02:00:00.000Z", false, call("recommened.calltime", { isCaller: 0, duration: 30 }));
    dm(db, "u-nho", "2026-11-05T01:00:00.000Z", false, call("recommened.misscall", { isCaller: 0 }));
    const list = listUnrepliedThreads(db, { sinceIso: SINCE });
    assert.deepEqual(list.map((t) => t.thread.threadId), ["u-nho"]);
    assert.equal(list[0]?.pending[0]?.missedCall, true);
  });

  it("đã thả cảm xúc vào tin cuối của họ thì coi như đã phản hồi; My Documents không tính", () => {
    const db = freshDb();
    const last = dm(db, "u-tim", "2026-11-05T01:00:00.000Z", false, { text: "xong rồi nha" });
    applyReaction(db, { actionId: "a1", targetMsgIds: [last], reactorId: ME, icon: "/-heart", reactedAt: "2026-11-05T01:01:00.000Z", threadId: "u-tim", threadType: "user" });
    setMeta(db, MY_DOCUMENTS_META_KEY, "u-mydoc");
    dm(db, "u-mydoc", "2026-11-05T01:00:00.000Z", false, { text: "ghi chú" });
    assert.deepEqual(ids(db), []);
  });
});

describe("listUnrepliedThreads - nhóm", () => {
  const mention = (uid: string, type = 0) => ({ mentions: [{ uid, pos: 0, len: 4, type }] });

  it("chỉ tin nhắc tên mình (không @All) hoặc trả lời tin mình, gửi sau lần cuối mình nhắn", () => {
    const db = freshDb();
    group(db, "2026-11-05T01:00:00.000Z", "u-a", mention(ME), "@Khê cũ");
    group(db, "2026-11-05T02:00:00.000Z", ME);
    group(db, "2026-11-05T03:00:00.000Z", "u-a", mention("-1", 1), "@All họp");
    group(db, "2026-11-05T04:00:00.000Z", "u-b", mention("u-c"), "@Chi ơi");
    group(db, "2026-11-05T05:00:00.000Z", "u-b", { quote: { ownerId: ME, msg: "x" } }, "đồng ý với anh");
    group(db, "2026-11-05T06:00:00.000Z", "u-a", mention(ME), "@Khê xem giúp");
    group(db, "2026-11-05T07:00:00.000Z", "u-d", {}, "tin thường");
    const list = listUnrepliedThreads(db, { sinceIso: SINCE });
    assert.equal(list.length, 1);
    assert.equal(list[0]?.reason, "mention");
    assert.deepEqual(list[0]?.pending.map((p) => p.preview), ["@Khê xem giúp", "đồng ý với anh"]);
  });

  it("tin nhắc mình đã được mình thả cảm xúc thì bỏ", () => {
    const db = freshDb();
    const m = group(db, "2026-11-05T01:00:00.000Z", "u-a", mention(ME), "@Khê ok chưa");
    applyReaction(db, { actionId: "a2", targetMsgIds: [m], reactorId: ME, icon: "/-strong", reactedAt: "2026-11-05T01:05:00.000Z", threadId: "g1", threadType: "group" });
    assert.deepEqual(ids(db), []);
  });
});
