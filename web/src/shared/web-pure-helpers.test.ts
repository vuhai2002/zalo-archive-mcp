import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayKey, formatClock, formatDateTime, formatDuration } from "./format-archive-time";
import { formatFileSize } from "./format-file-size";
import { safeNextPath } from "./safe-next-path";

const VN = "Asia/Ho_Chi_Minh";

describe("format-archive-time", () => {
  it("hiển thị theo múi giờ của kho, không theo giờ máy", () => {
    // 17:30 UTC = 00:30 ngày hôm sau ở VN
    assert.equal(formatClock("2026-10-28T17:30:00Z", VN), "00:30");
    assert.equal(dayKey("2026-10-28T17:30:00Z", VN), "2026-10-29");
  });

  it("khác năm hiện tại thì kèm năm, ngày đứng trước giờ", () => {
    assert.equal(formatDateTime("2024-05-12T00:00:00Z", VN), "12/05/2024 07:00");
  });

  it("'năm nay' tính theo `now` truyền vào (theo múi giờ kho), không theo năm của máy", () => {
    const now = new Date("2030-06-01T00:00:00Z");
    assert.equal(formatDateTime("2030-01-02T03:00:00Z", VN, now), "02/01 10:00");
    assert.equal(formatDateTime("2029-12-31T18:00:00Z", VN, now), "01/01 01:00"); // UTC còn 2029, giờ VN đã sang 2030
    assert.equal(formatDateTime("2031-01-02T03:00:00Z", VN, now), "02/01/2031 10:00");
  });

  it("mốc rỗng hoặc hỏng ra '-' thay vì 'Invalid Date'", () => {
    assert.equal(formatDateTime(null, VN), "-");
    assert.equal(formatClock("không phải ngày", VN), "-");
  });

  it("múi giờ sai tên thì rơi về UTC chứ không ném lỗi làm trắng trang", () => {
    assert.equal(formatClock("2026-10-28T17:30:00Z", "Khong/Ton_Tai"), "17:30");
  });

  it("độ dài khoảng mất kết nối", () => {
    assert.equal(formatDuration("2026-10-28T10:00:00Z", "2026-10-28T10:00:20Z"), "dưới 1 phút");
    assert.equal(formatDuration("2026-10-28T10:00:00Z", "2026-10-28T11:05:00Z"), "1 giờ 5 phút");
  });
});

describe("formatFileSize", () => {
  it("đổi đơn vị và bỏ qua giá trị không hợp lệ", () => {
    assert.equal(formatFileSize(512), "512 B");
    assert.equal(formatFileSize(1536), "1,5 KB");
    assert.equal(formatFileSize(null), "-");
    assert.equal(formatFileSize(-1), "-");
  });
});

describe("safeNextPath", () => {
  it("giữ đường dẫn nội bộ kèm query", () => {
    assert.equal(safeNextPath("/threads/123?x=1"), "/threads/123?x=1");
  });

  it("chặn chuyển hướng ra host khác", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", null]) {
      assert.equal(safeNextPath(bad), "/", String(bad));
    }
  });

  it("không quay lại chính trang đăng nhập", () => {
    assert.equal(safeNextPath("/login?next=/x"), "/");
  });
});
