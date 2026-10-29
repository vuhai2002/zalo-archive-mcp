import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractRenewLinkResults, RenewLinkReplyWaiter } from "./renew-link-control-listener.js";

/** Khung WS cmd 601 không mã hóa (encrypt 0), dạng như Zalo gửi sự kiện điều khiển */
function controlFrame(controls: unknown[], cmd = 601): Buffer {
  const header = Buffer.alloc(4);
  header[0] = 1;
  header.writeUInt16LE(cmd, 1);
  header[3] = 0;
  const body = JSON.stringify({ encrypt: 0, data: JSON.stringify({ data: { controls } }) });
  return Buffer.concat([header, Buffer.from(body, "utf8")]);
}

describe("sự kiện renew_link trên WebSocket", () => {
  it("đọc kết quả ảnh (img / normal / hd / thumb) và file (originalUrl / renewUrl), cả lỗi; bỏ sự kiện khác", () => {
    const frame = controlFrame([
      { content: { act_type: "file_done", act: "x", data: {} } },
      {
        content: {
          act: "renew_link",
          data: JSON.stringify([
            { destId: "1", destType: 1, img: "https://p/ori.jpg", normal: "https://p/n.jpg", hd: "https://p/hd.jpg", thumb: "https://p/t.jpg", errorCode: 0 },
            { destId: "1", originalUrl: "https://f/old", renewUrl: "https://f/new", error: 0 },
            { destId: "1", originalUrl: "https://f/het", error: 104 },
          ]),
        },
      },
    ]);
    assert.deepEqual(extractRenewLinkResults(frame, null), [
      { key: "https://p/ori.jpg", ok: true, bag: { normalUrl: "https://p/n.jpg", hdUrl: "https://p/hd.jpg", thumbUrl: "https://p/t.jpg" } },
      { key: "https://f/old", ok: true, bag: { normalUrl: "https://f/new" } },
      { key: "https://f/het", ok: false, error: "mã lỗi 104" },
    ]);
    assert.deepEqual(extractRenewLinkResults(controlFrame([{ content: { act: "renew_link", data: [] } }], 501), null), []);
  });

  it("lệnh chờ nhận đúng kết quả theo link gốc; không có thì hết giờ trả null; kết quả lạ không khớp", async () => {
    const waiter = new RenewLinkReplyWaiter();
    const a = waiter.expect(["https://p/ori.jpg", "https://p/n.jpg"]);
    assert.equal(waiter.deliver([{ key: "https://khac", ok: true, bag: {} }]), 0);
    assert.equal(waiter.deliver([{ key: "https://p/n.jpg", ok: true, bag: { normalUrl: "https://p/moi.jpg" } }]), 1);
    assert.deepEqual(await a.wait(1_000), { key: "https://p/n.jpg", ok: true, bag: { normalUrl: "https://p/moi.jpg" } });
    assert.equal(waiter.deliver([{ key: "https://p/ori.jpg", ok: true, bag: {} }]), 0, "đã nhận rồi thì gỡ hết khóa");

    const b = waiter.expect(["https://f/x"]);
    assert.equal(await b.wait(10), null);
  });
});
