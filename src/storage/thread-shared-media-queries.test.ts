import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { threadSharedMedia } from "./thread-shared-media-queries.js";

const live = { source: "live" as const, receivedAt: "2026-10-29T03:00:00.000Z" };
const withFile = (msgId: string, sentAt: string, kind: "photo" | "video" | "file" | "sticker", threadId = "g-1") =>
  sampleMessage({
    msgId,
    threadId,
    threadType: "group",
    sentAt,
    msgType: kind === "file" ? "share.file" : `chat.${kind}`,
    attachments: [{ kind, remoteUrl: `https://f.zdn.vn/${msgId}`, fileName: kind === "file" ? `${msgId}.pdf` : null, declaredSize: 10 }],
  });

describe("ảnh/video và file của một hội thoại (bảng thông tin bên phải)", () => {
  it("ảnh + video mới nhất trước, không lẫn sticker, file hay hội thoại khác; phân trang + tổng", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, withFile("1", "2026-10-29T01:00:00.000Z", "photo"), live);
    upsertMessage(db, withFile("2", "2026-10-29T02:00:00.000Z", "video"), live);
    upsertMessage(db, withFile("3", "2026-10-29T03:00:00.000Z", "sticker"), live);
    upsertMessage(db, withFile("4", "2026-10-29T04:00:00.000Z", "file"), live);
    upsertMessage(db, withFile("5", "2026-10-29T05:00:00.000Z", "photo", "g-2"), live);
    const visual = threadSharedMedia(db, { threadId: "g-1", threadType: "group", kind: "visual", limit: 10, offset: 0 });
    assert.deepEqual([visual.total, visual.items.map((i) => i.kind)], [2, ["video", "photo"]]);
    assert.equal(threadSharedMedia(db, { threadId: "g-1", threadType: "group", kind: "visual", limit: 1, offset: 1 }).items[0]!.kind, "photo");
    const files = threadSharedMedia(db, { threadId: "g-1", threadType: "group", kind: "file", limit: 10, offset: 0 });
    assert.deepEqual([files.total, files.items[0]!.fileName, files.items[0]!.sentAt], [1, "4.pdf", "2026-10-29T04:00:00.000Z"]);
  });
});
