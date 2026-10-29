import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FriendEventType, type API } from "zca-js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { contactsNeedingLookup } from "../storage/contact-store.js";
import { findThread, listThreads, readThread } from "../storage/message-read-queries.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { replaceFriendDirectory } from "../storage/thread-directory-store.js";
import { resolveMissingGroupInfo, resolveUnknownContacts } from "./contact-directory-sync.js";
import { applyFriendEvent, applyGroupEvent } from "./directory-event-handlers.js";
import { resolveStickerImages } from "./sticker-image-resolver.js";

const live = { source: "live" as const, receivedAt: "2026-10-29T03:00:00.000Z" };
const log = createSilentLogger();

function seeded() {
  const db = openArchiveDatabase(":memory:");
  upsertMessage(db, sampleMessage({ msgId: "1", threadId: "u-lan", senderId: "u-lan", senderName: "Lan" }), live);
  upsertMessage(
    db,
    sampleMessage({ msgId: "2", threadId: "g-1", threadType: "group", senderId: "u-minh", senderName: "Minh" }),
    live,
  );
  upsertMessage(
    db,
    sampleMessage({
      msgId: "3",
      msgType: "chat.sticker",
      text: "[sticker]",
      rawJson: JSON.stringify({ content: { id: 51001, catId: 51900, type: 7 } }),
    }),
    live,
  );
  return db;
}

describe("danh bạ, avatar, tên nhóm, sticker", () => {
  it("ghi tin là ghi luôn người gửi vào danh bạ; hỏi hồ sơ rồi avatar hiện ở hội thoại và ở tin nhóm", async () => {
    const db = seeded();
    assert.deepEqual(contactsNeedingLookup(db, 10, "2000-01-01T00:00:00.000Z").sort(), ["u-lan", "u-minh"]);
    const api = {
      getUserInfo: async (ids: string[]) => ({
        changed_profiles: Object.fromEntries(ids.map((id) => [`${id}_0`, { userId: id, displayName: id, avatar: `https://ava.zadn.vn/${id}.jpg` }])),
      }),
    } as unknown as API;
    await resolveUnknownContacts(api, db, log);
    assert.equal(findThread(db, "u-lan")?.avatarUrl, "https://ava.zadn.vn/u-lan.jpg");
    const [groupMsg] = readThread(db, { threadId: "g-1", threadType: "group", limit: 5 });
    assert.equal(groupMsg!.senderAvatarUrl, "https://ava.zadn.vn/u-minh.jpg");
    assert.deepEqual(contactsNeedingLookup(db, 10, "2000-01-01T00:00:00.000Z"), [], "đã hỏi rồi thì không hỏi lại ngay");
  });

  it("tên + avatar nhóm: hỏi ngay nhóm còn thiếu; sự kiện nhóm mang tên thì ghi luôn", async () => {
    const db = seeded();
    const api = {
      getGroupInfo: async (ids: string[]) => ({
        gridInfoMap: Object.fromEntries(ids.map((id) => [id, { name: "Nhóm Thử Nghiệm", avt: "https://g.zadn.vn/a.jpg" }])),
      }),
    } as unknown as API;
    await resolveMissingGroupInfo(api, db, log);
    assert.deepEqual([findThread(db, "g-1")?.name, findThread(db, "g-1")?.avatarUrl], ["Nhóm Thử Nghiệm", "https://g.zadn.vn/a.jpg"]);
    applyGroupEvent(db, { type: "update", data: { groupId: "g-1", groupName: "Tên mới" } });
    assert.equal(findThread(db, "g-1")?.name, "Tên mới");
  });

  it("kết bạn / hủy kết bạn cập nhật cờ bạn bè ngay", () => {
    const db = seeded();
    assert.equal(findThread(db, "u-lan")?.isFriend, false);
    assert.equal(applyFriendEvent(db, { type: FriendEventType.ADD, data: "u-lan", threadId: "u-lan" }), true);
    assert.equal(findThread(db, "u-lan")?.isFriend, true);
    applyFriendEvent(db, { type: FriendEventType.REMOVE, data: "u-lan", threadId: "u-lan" });
    assert.equal(findThread(db, "u-lan")?.isFriend, false);
    assert.equal(applyFriendEvent(db, { type: FriendEventType.REQUEST, data: {} }), false, "sự kiện khác bỏ qua");
  });

  it("sticker: hỏi ảnh MỘT lần theo số hiệu, gắn đính kèm loại sticker để tải về", async () => {
    const db = seeded();
    let calls = 0;
    const api = {
      getStickersDetail: async (ids: number[]) => {
        calls++;
        return ids.map((id) => ({ id, stickerUrl: `https://zalo-api.zadn.vn/s/${id}.png`, stickerWebpUrl: `https://zalo-api.zadn.vn/s/${id}.webp` }));
      },
    } as unknown as API;
    await resolveStickerImages(api, db, log);
    upsertMessage(db, sampleMessage({ msgId: "4", msgType: "chat.sticker", rawJson: JSON.stringify({ content: { id: 51001 } }) }), live);
    await resolveStickerImages(api, db, log);
    assert.equal(calls, 1, "sticker đã biết thì dùng catalog, không hỏi lại");
    const atts = db.prepare("SELECT msg_id, kind, remote_url FROM attachments ORDER BY msg_id").all() as Array<Record<string, string>>;
    assert.deepEqual(atts.map((a) => [a.msg_id, a.kind, a.remote_url]), [
      ["3", "sticker", "https://zalo-api.zadn.vn/s/51001.webp"],
      ["4", "sticker", "https://zalo-api.zadn.vn/s/51001.webp"],
    ]);
  });

  it("danh sách hội thoại không có từ khóa chỉ hiện hội thoại đã có tin; tìm theo tên thì ra cả bạn chưa nhắn", () => {
    const db = seeded();
    replaceFriendDirectory(db, [{ threadId: "u-zalo", name: "Zalo" }]);
    assert.ok(!listThreads(db, { limit: 50 }).some((t) => t.threadId === "u-zalo"));
    assert.deepEqual(listThreads(db, { query: "zalo", limit: 50 }).map((t) => t.threadId), ["u-zalo"]);
  });
});

describe("danh sách hội thoại kiểu Zalo", () => {
  it("tin cuối có tên file; nhóm ghép avatar người gửi gần nhất + chính mình", async () => {
    const { lastMessagePreview, groupMemberAvatars } = await import("../storage/thread-list-extras.js");
    const { setMeta } = await import("../storage/thread-directory-store.js");
    const { upsertContacts } = await import("../storage/contact-store.js");
    const db = seeded();
    upsertMessage(
      db,
      sampleMessage({
        msgId: "9",
        isSelf: true,
        senderId: "me",
        msgType: "share.file",
        text: "",
        sentAt: "2026-10-29T05:00:00.000Z",
        attachments: [{ kind: "file", remoteUrl: "https://dl.dlfl.vn/x", fileName: "Báo cáo.pdf", declaredSize: 1 }],
      }),
      live,
    );
    const p = lastMessagePreview(db, "u-lan", "user")!;
    assert.deepEqual([p.isSelf, p.attachmentKind, p.attachmentName], [true, "file", "Báo cáo.pdf"]);
    setMeta(db, "self_uid", "me");
    upsertContacts(db, [{ userId: "me", displayName: "Tôi", avatarUrl: "https://ava.zadn.vn/me.jpg" }]);
    assert.deepEqual(groupMemberAvatars(db, "g-1", 3).memberAvatars.map((m) => m.userId), ["u-minh", "me"]);
  });
});

describe("thành viên nhóm thật cho ảnh ghép", () => {
  it("lấy thứ tự + avatar thành viên từ thông tin nhóm, kể cả người chưa từng nhắn; vào/rời nhóm cập nhật ngay", async () => {
    const { groupMemberAvatars } = await import("../storage/thread-list-extras.js");
    const db = seeded();
    const api = {
      getGroupInfo: async () => ({
        gridInfoMap: {
          "g-1": {
            name: "Nhóm Thử Nghiệm",
            avt: "",
            totalMember: 3,
            // Zalo hay để trống memberIds/currentMems, danh sách thật ở memVerList "<uid>_<phiên bản>"
            memberIds: [],
            memVerList: ["1001_0", "1002_3", "1003_0"],
            currentMems: [],
          },
        },
      }),
    } as unknown as API;
    await resolveMissingGroupInfo(api, db, log);
    const r = groupMemberAvatars(db, "g-1", 4);
    assert.deepEqual(r.memberAvatars.map((m) => m.userId), ["1001", "1002", "1003"]);
    // Không có currentMems: thành viên vào danh bạ để hỏi hồ sơ (tên + avatar) ở vòng sau
    assert.ok(contactsNeedingLookup(db, 50, "2000-01-01T00:00:00.000Z").includes("1002"));
    assert.equal(r.memberCount, 3);

    applyGroupEvent(db, { act: "join", data: { groupId: "g-1", totalMembers: 4, updateMembers: [{ id: "1004", dName: "Mới", avatar: "https://a/m.jpg" }] } });
    assert.deepEqual(groupMemberAvatars(db, "g-1", 4).memberAvatars.map((m) => m.userId), ["1001", "1002", "1003", "1004"]);
    applyGroupEvent(db, { act: "leave", data: { groupId: "g-1", totalMembers: 3, updateMembers: [{ id: "1002" }] } });
    const after = groupMemberAvatars(db, "g-1", 4);
    assert.deepEqual([after.memberAvatars.map((m) => m.userId), after.memberCount], [["1001", "1003", "1004"], 3]);
  });
});
