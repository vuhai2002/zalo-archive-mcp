import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArchivedMessage } from "../../archive-api-types";
import { collapseAlbums, mergeAlbumReactions } from "./photo-album-grouping";

let nextId = 1;
const photo = (sender: string, album: { id: string; index: number } | null, reactions: ArchivedMessage["reactions"] = []): ArchivedMessage => ({
  id: nextId++,
  msgId: `m${nextId}`,
  threadId: "g-1",
  threadType: "group",
  senderId: sender,
  senderName: null,
  senderAvatarUrl: null,
  isSelf: false,
  msgType: album ? "chat.photo" : "webchat",
  text: "",
  quoteMsgId: null,
  sentAt: "2026-10-29T03:00:00.000Z",
  recalledAt: null,
  source: "mobile_sync",
  textStyles: [],
  call: null,
  album: album ? { ...album, total: 3, width: null, height: null } : null,
  link: null, contactCard: null, quote: null, video: null, noticeAvatars: [], noticePeople: 0, poll: null, reminder: null,
  reactions,
  attachments: [],
});

describe("gộp album ảnh thành khung lưới", () => {
  it("món cùng người, cùng mã chùm tới liền nhau gộp ở chỗ món đầu, xếp theo thứ tự trong chùm", () => {
    const a2 = photo("lan", { id: "A", index: 2 });
    const a0 = photo("lan", { id: "A", index: 0 });
    const a1 = photo("lan", { id: "A", index: 1 });
    const items = collapseAlbums([a2, a0, a1]);
    assert.equal(items.length, 1);
    assert.deepEqual(items[0]!.album!.map((m) => m.album!.index), [0, 1, 2]);
    assert.equal(items[0]!.msg, a2, "khung lưới đặt ở chỗ món tới đầu tiên");
  });

  it("tin khác chen giữa thì tách khung như Zalo PC: món trước tin một khung, món sau một khung; khúc còn một món hiện thường", () => {
    const b = (index: number) => photo("lan", { id: "B", index });
    const text = photo("lan", null);
    const items = collapseAlbums([b(3), b(0), b(1), text, b(2), b(4), text, b(5)]);
    assert.deepEqual(
      items.map((i) => (i.album ? i.album.map((m) => m.album!.index) : i.msg.album?.index ?? "tin")),
      [[0, 1, 3], "tin", [2, 4], "tin", 5],
    );
  });

  it("album chỉ còn một ảnh trong trang, hoặc khác người gửi: không gộp", () => {
    const items = collapseAlbums([photo("lan", { id: "B", index: 0 }), photo("minh", { id: "B", index: 1 })]);
    assert.deepEqual(items.map((i) => i.album), [null, null]);
  });

  it("cảm xúc trên các món gộp thành một dải, đếm theo lần bấm: lần bấm gắn vào cả khung chỉ tính một lần", () => {
    const heart = (mine: boolean, names: string[], tapIds: string[]) => ({ icon: "/-heart", emoji: "❤️", count: tapIds.length, mine, names, tapIds });
    // Như Zalo: 2 lần bấm tim lên chùm (t1, t2) gắn vào mọi món; Minh bấm thêm một lần lên riêng món 1 (t3)
    const merged = mergeAlbumReactions([
      photo("lan", { id: "C", index: 0 }, [heart(true, ["Bạn"], ["t1", "t2"])]),
      photo("lan", { id: "C", index: 1 }, [heart(true, ["Bạn", "Minh"], ["t1", "t2", "t3"])]),
      photo("lan", { id: "C", index: 2 }, [heart(true, ["Bạn"], ["t1", "t2"])]),
    ]);
    assert.deepEqual(merged, [heart(true, ["Bạn", "Minh"], ["t1", "t2", "t3"])]);
  });
});
