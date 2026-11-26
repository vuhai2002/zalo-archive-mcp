import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReleaseNotes } from "./release-notes-from-commits.js";

describe("pnpm release: ghi chú phát hành từ commit", () => {
  it("chia nhóm Tính năng mới / Sửa lỗi / Khác, bỏ commit phát hành, giữ link so sánh", () => {
    const notes = buildReleaseNotes(
      [
        "chore(release): v1.2.0",
        "fix(outbox): gửi lại đúng thứ tự",
        "feat: lọc tin theo ngày",
        "docs: thêm ảnh hướng dẫn",
        "Merge branch 'main'",
        "chore(deps): nâng thư viện",
      ],
      "https://github.com/example/repo/compare/v1.1.0...v1.2.0",
    );
    assert.equal(
      notes,
      [
        "## Tính năng mới\n- Lọc tin theo ngày",
        "## Sửa lỗi\n- Gửi lại đúng thứ tự",
        "## Khác\n- Thêm ảnh hướng dẫn",
        "**Full Changelog**: https://github.com/example/repo/compare/v1.1.0...v1.2.0",
      ].join("\n\n"),
    );
  });

  it("không có commit nào đáng kể thì vẫn có một câu, không để trống", () => {
    assert.equal(buildReleaseNotes(["chore(release): v1.2.1"], null), "Bản sửa nhỏ, không có thay đổi đáng kể.");
  });
});
