import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { containsUnsafeControlChars, escapeForTerminal } from "./terminal-safe-text.js";

describe("terminal-safe-text", () => {
  it("nhận ra CR, ESC, BiDi; chữ Việt, emoji, tab, xuống dòng là an toàn", () => {
    assert.equal(containsUnsafeControlChars("Chúc mừng sinh nhật bé Na! 🎂\n\tthương"), false);
    assert.equal(containsUnsafeControlChars("payload\r  nội dung: lời chúc"), true);
    assert.equal(containsUnsafeControlChars("ẩn \u001b[8m chữ"), true);
    assert.equal(containsUnsafeControlChars("đảo ‮ chiều"), true);
    // Gọi hai lần liên tiếp không bị lệch do cờ g của regex
    assert.equal(containsUnsafeControlChars("a\rb"), true);
    assert.equal(containsUnsafeControlChars("a\rb"), true);
  });

  it("thoát thành một dòng, ký tự điều khiển hiện ra thành mã", () => {
    assert.equal(escapeForTerminal("payload\r ok"), "payload\\u000d ok");
    assert.equal(escapeForTerminal("dòng 1\ndòng 2"), "dòng 1 \\n dòng 2");
    assert.equal(escapeForTerminal("\u001b[8mẩn"), "\\u001b[8mẩn");
  });
});
