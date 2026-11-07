import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEnterToSend } from "./composer-enter-to-send";

const key = (o: Partial<{ key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }>) => ({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, ...o });

describe("phím gửi trong ô soạn tin", () => {
  it("Enter gửi; Shift+Enter xuống dòng; phím khác không gửi", () => {
    assert.equal(isEnterToSend(key({})), true);
    assert.equal(isEnterToSend(key({ shiftKey: true })), false);
    assert.equal(isEnterToSend(key({ key: "a", keyCode: 65 })), false);
  });

  it("đang gõ dở bằng bộ gõ (IME) thì Enter chỉ chốt chữ", () => {
    assert.equal(isEnterToSend(key({ isComposing: true })), false);
    assert.equal(isEnterToSend(key({ keyCode: 229 })), false);
  });
});
