import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appAbout, authorOf } from "./app-version-and-update-checker.js";

describe("thông tin giới thiệu từ package.json", () => {
  it("đọc tên + link tác giả từ chuỗi kiểu npm hoặc object; bỏ email", () => {
    assert.deepEqual(authorOf("Tác Giả Thử Nghiệm (nm) (https://example.com/nm)"), { name: "Tác Giả Thử Nghiệm (nm)", url: "https://example.com/nm" });
    assert.deepEqual(authorOf("Tác Giả Thử Nghiệm <nm@example.com>"), { name: "Tác Giả Thử Nghiệm", url: null });
    assert.deepEqual(authorOf({ name: "Tác Giả Thử Nghiệm", url: "https://example.com/nm" }), { name: "Tác Giả Thử Nghiệm", url: "https://example.com/nm" });
    assert.deepEqual(authorOf(undefined), { name: null, url: null });
  });

  it("package.json của repo có đủ phiên bản, tác giả và link repo GitHub", () => {
    const a = appAbout();
    assert.match(a.version, /^\d+\.\d+\.\d+$/);
    assert.ok(a.authorName, "có tên tác giả");
    assert.match(a.authorUrl ?? "", /^https:\/\/github\.com\//);
    assert.match(a.repoUrl ?? "", /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
  });
});
