import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OutboxItem } from "../../archive-api-types";
import { attention, groupByDay, OUTBOX_TABS, statusLine, tabCount } from "./outbox-list-display";

const TZ = "Asia/Ho_Chi_Minh";
const NOW = new Date("2026-11-09T14:00:00.000Z"); // 21:00 ngày 09/11 giờ VN

let nextId = 1;
const item = (over: Partial<OutboxItem>): OutboxItem => ({
  id: nextId++,
  threadId: "u-1",
  threadType: "user",
  threadName: "Lan",
  threadAvatarUrl: null,
  memberAvatars: [],
  memberCount: null,
  text: "x",
  mode: "single",
  batchId: null,
  notBefore: null,
  status: "sent",
  createdBy: "mcp",
  note: null,
  createdAt: "2026-11-09T13:11:00.000Z",
  finishedAt: null,
  sentMsgId: null,
  error: null,
  recalledAt: null,
  recallRequestedAt: null,
  recallError: null,
  forwarded: false,
  files: [],
  ...over,
});

describe("trang Hàng đợi: hiển thị", () => {
  it("nhóm theo ngày tạo (giờ VN): Hôm nay, Hôm qua, rồi ngày đầy đủ; giữ thứ tự mới nhất trước", () => {
    const groups = groupByDay(
      [
        item({ createdAt: "2026-11-09T13:11:00.000Z" }),
        item({ createdAt: "2026-11-08T18:00:00.000Z" }), // 01:00 ngày 09/11 giờ VN: vẫn là hôm nay
        item({ createdAt: "2026-11-08T11:14:00.000Z" }),
        item({ createdAt: "2026-11-05T02:00:00.000Z" }),
      ],
      TZ,
      NOW,
    );
    assert.deepEqual(
      groups.map((g) => [g.label, g.items.length]),
      [
        ["Hôm nay", 2],
        ["Hôm qua", 1],
        ["Thứ Năm, 05/11/2026", 1],
      ],
    );
  });

  it("chữ trạng thái kèm giờ: cùng ngày tạo chỉ giờ, khác ngày kèm ngày; hẹn giờ tương lai ghi giờ gửi", () => {
    assert.deepEqual(statusLine(item({ finishedAt: "2026-11-09T13:11:30.000Z" }), TZ, NOW), { text: "Đã gửi 20:11", tone: "green", icon: "check" });
    assert.equal(statusLine(item({ status: "approved", notBefore: "2026-11-10T01:00:00.000Z" }), TZ, NOW).text, "Gửi lúc 10/11 08:00");
    assert.equal(statusLine(item({ status: "approved", notBefore: "2026-11-09T10:00:00.000Z" }), TZ, NOW).text, "Chờ gửi");
    assert.equal(statusLine(item({ status: "failed", finishedAt: "2026-11-09T13:12:00.000Z" }), TZ, NOW).text, "Lỗi 20:12");
    assert.equal(statusLine(item({ status: "draft" }), TZ, NOW).text, "Nháp chờ duyệt");
  });

  it("tin đã thu hồi / đang thu hồi hiện thay cho Đã gửi; thu hồi lỗi thì vẫn là Đã gửi", () => {
    assert.equal(statusLine(item({ recalledAt: "2026-11-09T13:45:00.000Z" }), TZ, NOW).text, "Đã thu hồi 20:45");
    assert.equal(statusLine(item({ recallRequestedAt: "2026-11-09T13:45:00.000Z" }), TZ, NOW).text, "Đang thu hồi...");
    assert.equal(statusLine(item({ recallRequestedAt: "x", recallError: "quá hạn", finishedAt: "2026-11-09T13:11:30.000Z" }), TZ, NOW).text, "Đã gửi 20:11");
  });

  it("tô nền tin cần xử lý; số trên tab chỉ ở Nháp và Lỗi (Lỗi = failed + rejected)", () => {
    assert.equal(attention(item({ status: "draft" })), "warning");
    assert.equal(attention(item({ status: "rejected" })), "danger");
    assert.equal(attention(item({ status: "sent" })), null);
    const counts = { draft: 2, approved: 3, sending: 0, sent: 9, failed: 1, cancelled: 0, rejected: 1 };
    assert.deepEqual(
      OUTBOX_TABS.map((t) => tabCount(t, counts)),
      [0, 2, 0, 0, 0, 2, 0],
    );
  });
});
