import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { createSilentLogger } from "../shared/logger.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { enqueueOutboxItem, type OutboxTextStyle } from "../storage/outbox-store.js";
import { OutboxSender } from "./outbox-sender-loop.js";
import { checkOutboxStyles } from "./outbox-text-styles.js";
import { toZaloMessage } from "./outbox-zalo-message-content.js";

describe("định dạng chữ của tin gửi đi", () => {
  it("không có định dạng thì danh sách rỗng", () => {
    assert.deepEqual(checkOutboxStyles(undefined, "Chào"), { styles: [] });
  });

  it("nhận đúng bộ mã của thanh định dạng Zalo, kể cả gộp nhiều mã một đoạn", () => {
    const text = "Hẹn họp lúc 9h nhé\nMục hai";
    const styles = [
      { start: 0, len: 7, st: "b,c_db342e,f_20" },
      { start: 8, len: 3, st: "i,u,s,f_13" },
      { start: 19, len: 7, st: "lst_2" },
      { start: 19, len: 7, st: "ind_20" },
    ];
    assert.deepEqual(checkOutboxStyles(styles, text), { styles });
  });

  it("từ chối mã lạ, màu ngoài bảng màu Zalo, mã lặp, vị trí ngoài chữ", () => {
    assert.match(String((checkOutboxStyles([{ start: 0, len: 1, st: "x" }], "ab") as { error: string }).error), /Mã định dạng lạ/);
    assert.ok("error" in checkOutboxStyles([{ start: 0, len: 1, st: "c_123456" }], "ab"));
    assert.ok("error" in checkOutboxStyles([{ start: 0, len: 1, st: "b,b" }], "ab"));
    assert.ok("error" in checkOutboxStyles([{ start: 1, len: 5, st: "b" }], "ab"));
    assert.ok("error" in checkOutboxStyles([{ start: 0, len: 0, st: "b" }], "ab"));
    assert.ok("error" in checkOutboxStyles({ start: 0 }, "ab"));
  });

  it("chữ bị cắt khoảng trắng hai đầu: dời vị trí theo, bỏ phần rơi vào khoảng trắng", () => {
    const raw = "  Chào thử  ";
    const r = checkOutboxStyles(
      [
        { start: 0, len: 6, st: "b" }, // "  Chào" -> "Chào"
        { start: 10, len: 2, st: "i" }, // chỉ là khoảng trắng cuối -> bỏ
      ],
      raw,
    );
    assert.deepEqual(r, { styles: [{ start: 0, len: 4, st: "b" }] });
  });
});

describe("daemon gửi tin có định dạng", () => {
  it("nội dung cho zca-js kèm styles; không định dạng thì vẫn là chữ trơn", () => {
    const styles = [{ start: 0, len: 4, st: "b,f_18" }];
    assert.equal(toZaloMessage("Chào", [], null, []), "Chào");
    assert.deepEqual(toZaloMessage("Chào", [], null, styles), { msg: "Chào", styles });
  });

  it("vòng gửi đưa định dạng đã lưu cho hàm gửi chữ", async () => {
    const db = openArchiveDatabase(":memory:");
    const styles = [{ start: 0, len: 3, st: "lst_1" }];
    enqueueOutboxItem(db, { threadId: "u-lan", threadType: "user", text: "Một", mode: "single", notBefore: null, batchId: null, createdBy: "dashboard", note: null, status: "approved", styles });
    const got: OutboxTextStyle[][] = [];
    const sender = new OutboxSender({
      db,
      env: parseEnv({}),
      log: createSilentLogger(),
      sendText: async (_t, _k, _text, _m, _r, s) => {
        got.push(s);
        return { msgId: "900" };
      },
      forwardText: async () => ({ msgId: null }),
      sleep: async () => {},
      isListenerConnected: () => true,
      isReadOnly: () => false,
      now: () => new Date("2026-03-10T07:00:00.000Z"),
      random: () => 0,
    });
    await sender.tick();
    assert.deepEqual(got, [styles]);
  });
});
