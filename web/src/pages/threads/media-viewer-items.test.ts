import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { ArchivedMessage, AttachmentInfo } from "../../archive-api-types";
import { formatVideoDuration, insertByTime, stripDayLabel, viewerItemFromMessage, viewerTimeLabel, type ViewerItem } from "./media-viewer-items";

const TZ = "Asia/Ho_Chi_Minh";
const NOW = new Date("2026-10-30T06:30:00.000Z"); // 13:30 giờ VN

// Link media chỉ nhận cùng origin với dashboard - test chạy ngoài trình duyệt nên dựng sẵn window.location
before(() => {
  (globalThis as { window?: unknown }).window = { location: { origin: "http://127.0.0.1:3210" } };
});

const att = (o: Partial<AttachmentInfo>): AttachmentInfo => ({
  id: 7,
  kind: "photo",
  status: "done",
  fileName: null,
  sizeBytes: 10,
  url: "/api/media/7?v=abc",
  mime: "image/jpeg",
  renewState: null,
  ...o,
});
const msg = { id: 42, sentAt: "2026-10-30T06:11:00.000Z", senderId: "u-1", senderName: "Quế Ngạn", senderAvatarUrl: null, isSelf: false, reactions: [] } as unknown as ArchivedMessage;

describe("cửa sổ xem ảnh / video", () => {
  it("thời lượng video như Zalo", () => {
    assert.equal(formatVideoDuration(33_000), "00:33");
    assert.equal(formatVideoDuration(725_400), "12:05");
    assert.equal(formatVideoDuration(3_723_000), "1:02:03");
  });

  it("nhãn ngày trên dải ảnh và giờ ở thanh dưới, theo giờ kho", () => {
    assert.equal(stripDayLabel("2026-10-30T01:00:00.000Z", TZ, NOW), "Hôm nay");
    assert.equal(stripDayLabel("2026-10-04T01:00:00.000Z", TZ, NOW), "04/10");
    assert.equal(stripDayLabel("2025-12-31T01:00:00.000Z", TZ, NOW), "31/12/2025");
    assert.equal(viewerTimeLabel("2026-10-30T06:11:00.000Z", TZ, NOW), "13:11 Hôm nay");
    assert.equal(viewerTimeLabel("2026-10-29T01:02:00.000Z", TZ, NOW), "08:02 Hôm qua");
    assert.equal(viewerTimeLabel("2026-10-23T05:15:00.000Z", TZ, NOW), "12:15 23/10/2026");
  });

  it("chỉ ảnh / video / gif đã tải mới mở được; ảnh SVG thì không", () => {
    assert.equal(viewerItemFromMessage(msg, att({}))?.messageId, 42);
    assert.equal(viewerItemFromMessage(msg, att({ kind: "video", mime: "video/mp4" }))?.kind, "video");
    assert.equal(viewerItemFromMessage(msg, att({ status: "pending", url: null })), null);
    assert.equal(viewerItemFromMessage(msg, att({ kind: "file" })), null);
    assert.equal(viewerItemFromMessage(msg, att({ mime: "image/svg+xml" })), null);
  });

  it("chèn ảnh vừa bấm vào đúng chỗ theo giờ, không trùng", () => {
    const it = (id: number, sentAt: string) => ({ id, sentAt }) as ViewerItem;
    const list = [it(1, "2026-10-01"), it(3, "2026-10-03")];
    assert.deepEqual(insertByTime(list, it(2, "2026-10-02")).map((x) => x.id), [1, 2, 3]);
    assert.deepEqual(insertByTime(list, it(9, "2026-10-09")).map((x) => x.id), [1, 3, 9]);
    assert.equal(insertByTime(list, it(3, "2026-10-03")), list);
  });
});
