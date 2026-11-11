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
  it("ảnh cùng người, cùng mã album gộp vào vị trí ảnh đầu, xếp theo thứ tự trong album; tin chen giữa giữ chỗ", () => {
    const a2 = photo("lan", { id: "A", index: 2 });
    const a0 = photo("lan", { id: "A", index: 0 });
    const text = photo("minh", null);
    const a1 = photo("lan", { id: "A", index: 1 });
    const items = collapseAlbums([a2, a0, text, a1]);
    assert.equal(items.length, 2);
    assert.deepEqual(items[0]!.album!.map((m) => m.album!.index), [0, 1, 2]);
    assert.equal(items[0]!.msg, a2, "khung lưới đặt ở chỗ ảnh tới đầu tiên");
    assert.equal(items[1]!.msg, text);
    assert.equal(items[1]!.album, null);
  });

  it("album chỉ còn một ảnh trong trang, hoặc khác người gửi: không gộp", () => {
    const items = collapseAlbums([photo("lan", { id: "B", index: 0 }), photo("minh", { id: "B", index: 1 })]);
    assert.deepEqual(items.map((i) => i.album), [null, null]);
  });

  it("cảm xúc trên các ảnh gộp thành một dải", () => {
    const heart = (count: number, mine: boolean, names: string[]) => ({ icon: "/-heart", emoji: "❤️", count, mine, names });
    const merged = mergeAlbumReactions([
      photo("lan", { id: "C", index: 0 }, [heart(1, false, ["Minh"])]),
      photo("lan", { id: "C", index: 1 }, [heart(2, true, ["Minh", "Bạn"])]),
    ]);
    assert.deepEqual(merged, [heart(3, true, ["Minh", "Bạn"])]);
  });
});
