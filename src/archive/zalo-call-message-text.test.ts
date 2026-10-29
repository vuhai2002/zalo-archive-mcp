import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callNoticeOf, formatCallDuration } from "./zalo-call-message-text.js";

const params = (p: Record<string, unknown>) => JSON.stringify(p);

describe("tin cuộc gọi Zalo", () => {
  it("cuộc gọi đến bị nhỡ (người nhận là mình): 'Bạn bị nhỡ', tô đỏ", () => {
    const n = callNoticeOf("recommened.misscall", params({ duration: 0, reason: 1, isCaller: 0, calltype: 0 }));
    assert.deepEqual(n, { title: "Bạn bị nhỡ", detail: "Cuộc gọi thoại", missedIncoming: true });
  });

  it("cuộc gọi có thời lượng: video đến, thoại đi", () => {
    assert.deepEqual(callNoticeOf("recommened.calltime", params({ duration: 2519, isCaller: 0, calltype: 1 })), {
      title: "Cuộc gọi video đến",
      detail: "41 phút 59 giây",
      missedIncoming: false,
    });
    assert.deepEqual(callNoticeOf("recommened.calltime", params({ duration: 1442, isCaller: 1, calltype: 0 })), {
      title: "Cuộc gọi thoại đi",
      detail: "24 phút 2 giây",
      missedIncoming: false,
    });
  });

  it("mình gọi đi mà không thành: hủy / bị từ chối / người nhận bận / không ai nghe", () => {
    const out = (reason: number) => callNoticeOf("recommened.misscall", params({ reason, isCaller: 1, calltype: 0 }));
    assert.equal(out(5)!.title, "Bạn đã hủy");
    assert.equal(out(4)!.title, "Bạn đã hủy");
    assert.equal(out(3)!.title, "Người nhận từ chối");
    assert.equal(out(1)!.title, "Người nhận bận");
    assert.deepEqual(out(2), { title: "Cuộc gọi thoại đi", detail: "0 phút 0 giây", missedIncoming: false });
    assert.equal(out(1)!.detail, "Cuộc gọi thoại");
  });

  it("mình từ chối cuộc gọi đến", () => {
    const n = callNoticeOf("recommened.misscall", params({ reason: 3, isCaller: 0, calltype: 1 }));
    assert.deepEqual(n, { title: "Bạn đã từ chối", detail: "Cuộc gọi video", missedIncoming: true });
  });

  it("thiếu isCaller: 'calling' là mình gọi, loại khác là mình nhận; params hỏng vẫn ra câu", () => {
    assert.equal(callNoticeOf("recommened.calling", "{}")!.title, "Cuộc gọi thoại đi");
    assert.equal(callNoticeOf("recommened.receivecall", "{hỏng")!.title, "Cuộc gọi thoại đến");
  });

  it("không phải tin cuộc gọi thì trả null", () => {
    assert.equal(callNoticeOf("recommened.link", "{}"), null);
    assert.equal(callNoticeOf(undefined, undefined), null);
  });

  it("thời lượng có giờ thì thêm giờ ở đầu", () => {
    assert.equal(formatCallDuration(3_725), "1 giờ 2 phút 5 giây");
    assert.equal(formatCallDuration(undefined), "0 phút 0 giây");
  });
});
