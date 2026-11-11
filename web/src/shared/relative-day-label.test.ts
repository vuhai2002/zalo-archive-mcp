import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarTileParts, relativeDayLabel } from "./relative-day-label";

const TZ = "Asia/Ho_Chi_Minh";
const NOW = new Date("2026-03-11T10:22:00.000Z"); // 17:22 thứ Tư 11/03 giờ VN

describe("ngày nói gần + ô lịch như Zalo PC", () => {
  it("Hôm nay / Ngày mai / Hôm qua theo giờ VN, ngày khác dd/MM/yyyy", () => {
    assert.equal(relativeDayLabel("2026-03-11T03:15:00.000Z", TZ, NOW), "Hôm nay");
    assert.equal(relativeDayLabel("2026-03-11T17:00:00.000Z", TZ, NOW), "Ngày mai", "00:00 ngày 12 giờ VN");
    assert.equal(relativeDayLabel("2026-03-10T03:15:00.000Z", TZ, NOW), "Hôm qua");
    assert.equal(relativeDayLabel("2026-03-02T03:15:00.000Z", TZ, NOW), "02/03/2026");
  });

  it("ô lịch: thứ in hoa, ngày, THÁNG N; tính theo giờ VN chứ không theo UTC", () => {
    assert.deepEqual(calendarTileParts("2026-03-11T03:15:00.000Z", TZ), { weekday: "THỨ TƯ", day: "11", month: "THÁNG 3" });
    assert.deepEqual(calendarTileParts("2026-03-14T18:30:00.000Z", TZ), { weekday: "CHỦ NHẬT", day: "15", month: "THÁNG 3" });
  });
});
