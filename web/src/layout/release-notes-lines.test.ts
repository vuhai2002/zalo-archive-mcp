import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleReleaseNoteLines } from "./release-notes-lines";

describe("ghi chú phát hành trong hộp Đã có bản mới", () => {
  it("chỉ có link Full Changelog (ghi chú GitHub tự sinh khi không có pull request): không còn dòng nào để hiện", () => {
    assert.deepEqual(visibleReleaseNoteLines("**Full Changelog**: https://github.com/example/repo/compare/v1.0.0...v1.0.1"), []);
    assert.deepEqual(visibleReleaseNoteLines(null), []);
    assert.deepEqual(visibleReleaseNoteLines("\n<!-- ghi chú -->\n"), []);
  });

  it("giữ tiêu đề và gạch đầu dòng, bỏ dòng trống và link so sánh", () => {
    const notes = "## Sửa lỗi\n- Gửi lại đúng thứ tự\n\n**Full Changelog**: https://github.com/example/repo/compare/v1.0.0...v1.0.1";
    assert.deepEqual(visibleReleaseNoteLines(notes), ["## Sửa lỗi", "- Gửi lại đúng thứ tự"]);
  });
});
