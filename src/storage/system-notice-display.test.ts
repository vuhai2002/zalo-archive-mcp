import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { groupEventNotice } from "../zalo/normalize-reaction-and-group-event.js";
import { normalizeMessage } from "../zalo/normalize-zalo-event.js";
import { ARCHIVE_MIGRATIONS } from "./archive-schema-migrations.js";
import { replaceContactAliases } from "./contact-alias-store.js";
import { upsertContacts } from "./contact-store.js";
import { readThread } from "./message-read-queries.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { setMeta } from "./thread-directory-store.js";
import { lastMessagePreview } from "./thread-list-extras.js";

const live = { source: "live" as const, receivedAt: "2023-11-14T22:13:12.719Z" };
const GROUP = "202000000000000109";
const bolded = (m: { text: string; textStyles: Array<{ start: number; end: number; bold: boolean }> }) =>
  m.textStyles.filter((s) => s.bold).map((s) => m.text.slice(s.start, s.end));

/** Tin webchat "X vừa yêu cầu tham gia nhóm." đúng dạng Zalo gửi (mã người trong params là số) */
const joinRequestData = () => ({
  msgId: "8400011000001",
  msgType: "webchat",
  uidFrom: "2060000000000000108",
  dName: "Quế Khuê",
  ts: "1700000000104",
  content: {
    title: "Quế Khuê vừa yêu cầu tham gia nhóm",
    action: "msginfo.actionlist",
    params:
      '{"msg":{"vi":"%1$s vừa yêu cầu tham gia nhóm.","en":"%1$s just requested to join group."},' +
      '"avatarUrl":"https://s160-ava-talk.zadn.vn/t.jpg","simpleInfos":[{"uid":2060000000000000108,"dpn":"Quế Khuê"}],' +
      '"highLightsV2":[{"uid":2060000000000000108,"dpn":"Quế Khuê","type":0}],' +
      '"actions":[{"actionLabelv2":{"vi":"Chi tiết"},"actionType":"action.open.request.joingroup"}]}',
  },
});

describe("thông báo nhóm hiện như Zalo", () => {
  it("lúc nhận chưa biết tên (chữ lưu mang mã số): lúc đọc dựng lại theo danh bạ, tên gợi nhớ trước, tên in đậm, có avatar", () => {
    const db = openArchiveDatabase(":memory:");
    setMeta(db, "self_uid", "100");
    const event = { act: "join", data: { groupId: GROUP, sourceId: "1", time: "1700000000105", updateMembers: [{ id: "2" }] } };
    const notice = groupEventNotice(event, { selfUid: "100", nameOf: () => null, groupNameOf: () => null, receivedAt: new Date() })!;
    assert.equal(notice.text, "2 được 1 thêm vào nhóm");
    upsertMessage(db, notice, live);
    upsertContacts(db, [
      { userId: "1", displayName: "Mẫn Khuê Trác", avatarUrl: null },
      { userId: "2", displayName: "Quế Khuê", avatarUrl: "https://s160-ava-talk.zadn.vn/2.jpg" },
    ]);
    replaceContactAliases(db, [{ userId: "1", alias: "Sếp Trác" }]);

    const [m] = readThread(db, { threadId: GROUP, threadType: "group", limit: 5 });
    assert.equal(m!.text, "Quế Khuê được Sếp Trác thêm vào nhóm");
    assert.deepEqual(bolded(m!), ["Quế Khuê", "Sếp Trác"]);
    assert.deepEqual(m!.noticeAvatar, { userId: "2", name: "Quế Khuê", url: "https://s160-ava-talk.zadn.vn/2.jpg" });
    assert.equal(lastMessagePreview(db, GROUP, "group")!.text, "Quế Khuê được Sếp Trác thêm vào nhóm");
  });

  it("'X vừa yêu cầu tham gia nhóm.' là thông báo giữa khung chat, không phải tin của X", () => {
    const db = openArchiveDatabase(":memory:");
    const msg = normalizeMessage({ threadType: "group", threadId: GROUP, isSelf: false, data: joinRequestData() }, new Date())!;
    assert.deepEqual([msg.msgType, msg.text, msg.attachments], ["group_event", "Quế Khuê vừa yêu cầu tham gia nhóm.", []]);
    upsertMessage(db, msg, live);
    const [m] = readThread(db, { threadId: GROUP, threadType: "group", limit: 5 });
    assert.deepEqual([m!.msgType, m!.text, bolded(m!)], ["group_event", "Quế Khuê vừa yêu cầu tham gia nhóm.", ["Quế Khuê"]]);
    assert.deepEqual(m!.noticeAvatar, { userId: null, name: null, url: "https://s160-ava-talk.zadn.vn/t.jpg" });
    // Tin chữ thường không bị đụng
    const chat = normalizeMessage({ threadType: "group", threadId: GROUP, isSelf: false, data: { ...joinRequestData(), msgId: "2", content: "chào" } }, new Date())!;
    assert.deepEqual([chat.msgType, chat.text], ["webchat", "chào"]);
  });

  it("nâng kho cũ: tin msginfo đã lưu dạng webchat chuyển sang thông báo nhóm", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-notice-"));
    const file = path.join(dir, "archive.db");
    const old = new DatabaseSync(file);
    ARCHIVE_MIGRATIONS.slice(0, 16).forEach((sql) => old.exec(sql));
    old.exec("PRAGMA user_version = 16");
    const insert = old.prepare(
      `INSERT INTO messages (msg_id, thread_id, thread_type, sender_id, sender_name, is_self, msg_type, text, sent_at, received_at, source, raw_json)
       VALUES (?, ?, 'group', '2060000000000000108', 'Quế Khuê', 0, 'webchat', ?, '2023-11-14T22:13:20.104Z', '2023-11-14T22:13:20.344Z', 'live', ?)`,
    );
    insert.run("1", GROUP, "Quế Khuê vừa yêu cầu tham gia nhóm", JSON.stringify(joinRequestData()));
    insert.run("2", GROUP, "chào cả nhóm", JSON.stringify({ msgType: "webchat", content: "chào cả nhóm" }));
    old.close();

    const db = openArchiveDatabase(file);
    try {
      const rows = db.prepare("SELECT msg_id, msg_type FROM messages ORDER BY msg_id").all();
      assert.deepEqual(rows.map((r) => [r.msg_id, r.msg_type]), [["1", "group_event"], ["2", "webchat"]]);
      const texts = readThread(db, { threadId: GROUP, threadType: "group", limit: 5 }).map((m) => m.text);
      assert.ok(texts.includes("Quế Khuê vừa yêu cầu tham gia nhóm."));
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
