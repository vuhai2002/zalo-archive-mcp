import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathAfterNickSwitch } from "./path-after-nick-switch";

describe("đổi nick: trang đang mở", () => {
  it("đang mở một hội thoại của nick cũ thì về danh sách hội thoại", () => {
    assert.equal(pathAfterNickSwitch("/threads/1000000000000000001"), "/threads");
    assert.equal(pathAfterNickSwitch("/threads/g-1/"), "/threads");
  });

  it("danh sách hội thoại và các trang khác thì giữ nguyên", () => {
    for (const p of ["/threads", "/threads/", "/overview", "/outbox", "/zalo", "/settings/sync"]) assert.equal(pathAfterNickSwitch(p), null, p);
  });
});
