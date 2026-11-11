import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reminderCardOf } from "./zalo-reminder-card.js";

/** Nội dung thẻ nhắc hẹn đúng dạng Zalo gửi (ví dụ tự dựng) */
function reminderContent(over: Record<string, unknown> = {}) {
  const inner = { msg: '"""Họp nhóm đầu tuần..."', emoji: "⏰", repeatRule: ["RRULE:FREQ=DAILY"], repeat: 1, startTime: 1794792600000, topicId: "310000000000000116", ...over };
  const action = { data: JSON.stringify({ act: "remind_topic", data: JSON.stringify(inner), act_type: "group" }), actionId: "action.open.reminder" };
  return { title: '⏰ ""Họp nhóm đầu tuần...', description: "Thứ Hai, 16 tháng 11 lúc 08:30", params: JSON.stringify({ layoutType: 2, actions: [action] }) };
}

describe("thẻ nhắc hẹn của nhóm", () => {
  it("đọc tên hẹn (bỏ biểu tượng đầu), giờ hẹn, lặp theo ngày như Zalo PC", () => {
    assert.deepEqual(reminderCardOf(reminderContent()), {
      title: '""Họp nhóm đầu tuần...',
      emoji: "⏰",
      startAt: "2026-11-16T01:30:00.000Z",
      repeat: "daily",
    });
  });

  it("lặp theo tuần / không lặp; nội dung là chuỗi JSON cũng đọc được", () => {
    assert.equal(reminderCardOf(JSON.stringify(reminderContent({ repeatRule: ["RRULE:FREQ=WEEKLY;BYDAY=MO"] })))?.repeat, "weekly");
    assert.equal(reminderCardOf(reminderContent({ repeat: 0, repeatRule: [] }))?.repeat, null);
  });

  it("thẻ ecard khác (kết bạn, sinh nhật) hay dữ liệu hỏng thì không phải nhắc hẹn", () => {
    assert.equal(reminderCardOf({ title: "Sinh nhật của An", params: "{}" }), null);
    assert.equal(reminderCardOf(reminderContent({ startTime: "x" })), null);
    assert.equal(reminderCardOf("không phải json"), null);
  });
});
