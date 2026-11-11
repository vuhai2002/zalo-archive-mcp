import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ingestArchiveEvent } from "../archive/archive-event-ingestor.js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertContacts } from "../storage/contact-store.js";
import { readThread } from "../storage/message-read-queries.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { setMeta, upsertGroupNames } from "../storage/thread-directory-store.js";

const ME = "211000000000000102";
const LAN = "111";
const GROUP = "2040000000000000117";
const log = createSilentLogger();
const at = new Date("2026-10-29T03:30:00.000Z");

/** Reaction đúng dạng zca-js ghi ra (đã thay uidFrom "0" bằng uid của mình) */
const reaction = (o: { from: string; icon: string; ts: number; target?: string }) => ({
  data: { msgId: `${o.ts}${o.from.slice(0, 3)}`, uidFrom: o.from, idTo: ME, ts: String(o.ts), content: { rMsg: [{ gMsgID: o.target ?? "1000", cMsgID: "c", msgType: 1 }], rIcon: o.icon, rType: 0, source: 6 } },
  threadId: LAN,
  isSelf: o.from === ME,
  isGroup: false,
});

function setup() {
  const db = openArchiveDatabase(":memory:");
  setMeta(db, "self_uid", ME);
  upsertMessage(db, sampleMessage({ msgId: "1000", threadId: LAN, senderId: LAN }), { source: "live", receivedAt: at.toISOString() });
  upsertContacts(db, [
    { userId: LAN, displayName: "Lan", avatarUrl: null },
    { userId: "2140000000000000111", displayName: "Ngạn Lư", avatarUrl: null },
  ]);
  const reactionsOf = () => readThread(db, { threadId: LAN, threadType: "user", limit: 10 })[0]!.reactions;
  return { db, reactionsOf };
}

describe("cảm xúc trên tin", () => {
  it("đếm từng lần bấm như Zalo (bấm tim 3 lần = ❤️ 3); gỡ thì bỏ hết lần bấm trước của người đó", () => {
    const { db, reactionsOf } = setup();
    const tap = (from: string, icon: string, ts: number) =>
      ingestArchiveEvent(db, { kind: "reaction", reaction: reaction({ from, icon, ts }) }, at, log);
    tap(LAN, "/-heart", 1_793_244_600_000);
    tap(ME, "/-heart", 1_793_244_601_000);
    assert.deepEqual(reactionsOf(), [{ icon: "/-heart", emoji: "❤️", count: 2, mine: true, names: ["Lan", "Bạn"] }]);

    // Lan bấm thêm haha và tim hai lần nữa: Zalo cộng dồn, giữ cả hai loại
    tap(LAN, ":>", 1_793_244_602_000);
    tap(LAN, "/-heart", 1_793_244_602_500);
    tap(LAN, "/-heart", 1_793_244_602_600);
    tap(LAN, "/-heart", 1_793_244_602_600); // cùng sự kiện tới lần hai (lấy bù): không đếm đôi
    assert.deepEqual(
      reactionsOf().map((r) => [r.emoji, r.count, r.names]),
      [["❤️", 4, ["Lan", "Bạn"]], ["😆", 1, ["Lan"]]],
    );
    // Mình gỡ cảm xúc: chỉ mất tim của mình
    tap(ME, "", 1_793_244_603_000);
    assert.deepEqual(
      reactionsOf().map((r) => [r.emoji, r.count, r.mine]),
      [["❤️", 3, false], ["😆", 1, false]],
    );
  });

  it("sự kiện tới trễ (lấy bù, phát lại nhật ký) không đè được trạng thái mới hơn; mã lạ giữ nguyên mã", () => {
    const { db, reactionsOf } = setup();
    ingestArchiveEvent(db, { kind: "reaction", reaction: reaction({ from: LAN, icon: "/-strong", ts: 1_793_244_700_000 }) }, at, log);
    // Cảm xúc lấy bù tới với content là CHUỖI JSON (đúng như Zalo trả về cho cmd 610/611)
    const old = reaction({ from: LAN, icon: "/-heart", ts: 1_793_244_600_000 });
    ingestArchiveEvent(db, { kind: "old_reactions", reactions: [{ ...old, data: { ...old.data, content: JSON.stringify(old.data.content) } }] }, at, log);
    assert.deepEqual(reactionsOf().map((r) => r.emoji), ["❤️", "👍"], "cảm xúc lấy bù (content chuỗi) vào kho");
    ingestArchiveEvent(db, { kind: "reaction", reaction: reaction({ from: LAN, icon: "", ts: 1_793_244_650_000 }) }, at, log);
    assert.deepEqual(reactionsOf().map((r) => r.emoji), ["👍"]);

    ingestArchiveEvent(db, { kind: "reaction", reaction: reaction({ from: ME, icon: "/-moi-la", ts: 1_793_244_800_000 }) }, at, log);
    assert.deepEqual(reactionsOf()[1], { icon: "/-moi-la", emoji: null, count: 1, mine: true, names: ["Bạn"] });
  });
});

describe("sự kiện nhóm thành tin hệ thống giữa dòng chat", () => {
  const groupEvent = (act: string, o: { source: string; members: Array<[string, string]>; time: number; name?: string }) => ({
    type: act,
    act,
    threadId: GROUP,
    isSelf: true,
    data: { groupId: GROUP, groupName: o.name ?? "Nhóm Thử Nghiệm", sourceId: o.source, creatorId: o.source, updateMembers: o.members.map(([id, dName]) => ({ id, dName })), time: String(o.time) },
  });
  const notices = (db: ReturnType<typeof openArchiveDatabase>) =>
    readThread(db, { threadId: GROUP, threadType: "group", limit: 20 }).map((m) => [m.msgType, m.text]);

  it("thêm người, tham gia, rời, đổi tên; ghi lại lần hai không bị trùng; sự kiện khác bỏ qua", () => {
    const { db } = setup();
    upsertGroupNames(db, [{ threadId: GROUP, name: "Nhóm Thử Nghiệm" }]);
    const add = groupEvent("join", { source: "2140000000000000111", members: [[ME, "Khúc Mẫn"], ["203000000000000118", "Mạc Văn Quế"]], time: 1_793_244_743_513 });
    ingestArchiveEvent(db, { kind: "group_event", event: add }, at, log);
    ingestArchiveEvent(db, { kind: "group_event", event: add }, at, log);
    ingestArchiveEvent(db, { kind: "group_event", event: groupEvent("join", { source: "222", members: [["222", "Bình"]], time: 1_793_244_800_000 }) }, at, log);
    ingestArchiveEvent(db, { kind: "group_event", event: groupEvent("leave", { source: "222", members: [["222", "Bình"]], time: 1_793_244_900_000 }) }, at, log);
    ingestArchiveEvent(db, { kind: "group_event", event: groupEvent("update", { source: ME, members: [], time: 1_793_245_000_000, name: "Nhóm Thử Nghiệm 2" }) }, at, log);
    ingestArchiveEvent(db, { kind: "group_event", event: groupEvent("update", { source: ME, members: [], time: 1_793_245_100_000 }) }, at, log);
    ingestArchiveEvent(db, { kind: "group_event", event: groupEvent("new_pin_topic", { source: ME, members: [], time: 1_793_245_200_000 }) }, at, log);

    assert.deepEqual(notices(db), [
      ["group_event", "Bạn, Mạc Văn Quế được Ngạn Lư thêm vào nhóm"],
      ["group_event", "Bình đã tham gia nhóm"],
      ["group_event", "Bình đã rời khỏi nhóm"],
      ["group_event", "Bạn đổi tên nhóm thành Nhóm Thử Nghiệm 2"],
    ]);
  });
});
