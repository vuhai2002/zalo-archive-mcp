import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pollEndTimeLabel } from "./poll-end-time-label";

const TZ = "Asia/Ho_Chi_Minh";
const NOW = new Date("2026-03-11T10:22:00.000Z"); // 17:22 ngày 11/03 giờ VN

describe("dòng hạn bình chọn trên thẻ", () => {
  it("như Zalo PC: Kết thúc lúc 00:00 Ngày mai; hôm nay / ngày khác; đã qua thì Đã kết thúc", () => {
    assert.equal(pollEndTimeLabel("2026-03-11T17:00:00.000Z", TZ, NOW), "Kết thúc lúc 00:00 Ngày mai");
    assert.equal(pollEndTimeLabel("2026-03-11T12:45:00.000Z", TZ, NOW), "Kết thúc lúc 19:45 Hôm nay");
    assert.equal(pollEndTimeLabel("2026-03-20T02:00:00.000Z", TZ, NOW), "Kết thúc lúc 09:00 20/03/2026");
    assert.equal(pollEndTimeLabel("2026-03-10T13:00:00.000Z", TZ, NOW), "Đã kết thúc lúc 20:00 Hôm qua");
  });

  it("không có hạn hay hạn lạ thì không hiện", () => {
    assert.equal(pollEndTimeLabel(null, TZ, NOW), null);
    assert.equal(pollEndTimeLabel("không phải ngày", TZ, NOW), null);
  });
});
