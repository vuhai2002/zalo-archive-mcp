import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionStatus } from "../archive-api-types";
import { listenerRetryText } from "./session-state-labels";

const base: SessionStatus = {
  state: "running",
  account: null,
  selfUid: null,
  displayName: null,
  listenerConnected: false,
  listenerRetryAt: "2026-03-01T01:30:26.000Z",
  listenerCloseCode: 3000,
  listenerCloseReason: "NOT_AUTHENTICATED",
  qrImageBase64: null,
  qrStatus: null,
  lastError: null,
  lastHeartbeatAt: null,
};

describe("câu báo listener đang chờ tự nối lại", () => {
  it("nói mã đóng + giờ tự nối lại theo giờ kho; đang kết nối / không hẹn / không chạy thì không nói", () => {
    assert.equal(listenerRetryText(base, "Asia/Ho_Chi_Minh"), "Zalo đóng kết nối nghe tin (mã 3000 - NOT_AUTHENTICATED), kho tự nối lại lúc 08:30");
    assert.equal(listenerRetryText({ ...base, listenerCloseReason: null }, "Asia/Ho_Chi_Minh"), "Zalo đóng kết nối nghe tin (mã 3000), kho tự nối lại lúc 08:30");
    assert.equal(listenerRetryText({ ...base, listenerConnected: true }, "Asia/Ho_Chi_Minh"), null);
    assert.equal(listenerRetryText({ ...base, listenerRetryAt: null }, "Asia/Ho_Chi_Minh"), null);
    assert.equal(listenerRetryText({ ...base, state: "gave_up" }, "Asia/Ho_Chi_Minh"), null);
  });
});
