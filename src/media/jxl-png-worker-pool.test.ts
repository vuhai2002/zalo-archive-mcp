import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JxlPngWorkerPool } from "./jxl-png-worker-pool.js";

const GARBAGE = () => new Uint8Array([1, 2, 3, 4]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("pool đổi JXL sang PNG ở luồng phụ", () => {
  it("dữ liệu không phải JXL: báo lỗi giải mã từ luồng phụ, luồng vẫn dùng tiếp được cho ảnh sau", async () => {
    const pool = new JxlPngWorkerPool(1);
    try {
      await assert.rejects(pool.convert(GARBAGE()), (err: Error) => err.message.length > 0);
      await assert.rejects(pool.convert(GARBAGE()));
      assert.equal(pool.openWorkers, 1);
    } finally {
      await pool.close();
    }
  });

  it("nhiều ảnh cùng lúc: mở tối đa `size` luồng, ảnh dư xếp hàng và vẫn xong hết", async () => {
    const pool = new JxlPngWorkerPool(2);
    try {
      const jobs = Array.from({ length: 5 }, () => pool.convert(GARBAGE()).then(() => "ok", () => "lỗi"));
      assert.equal(pool.openWorkers, 2);
      assert.deepEqual(await Promise.all(jobs), ["lỗi", "lỗi", "lỗi", "lỗi", "lỗi"]);
    } finally {
      await pool.close();
    }
  });

  it("rảnh quá lâu thì tắt luồng để trả bộ nhớ; có ảnh mới thì mở lại", async () => {
    const pool = new JxlPngWorkerPool(1, 50);
    try {
      await pool.convert(GARBAGE()).catch(() => {});
      await sleep(400);
      assert.equal(pool.openWorkers, 0);
      await assert.rejects(pool.convert(GARBAGE()));
      assert.equal(pool.openWorkers, 1);
    } finally {
      await pool.close();
    }
  });

  it("đã đóng thì từ chối ảnh mới; số luồng phải >= 1", async () => {
    const pool = new JxlPngWorkerPool(1);
    await pool.close();
    await assert.rejects(pool.convert(GARBAGE()), /đã đóng/);
    assert.throws(() => new JxlPngWorkerPool(0));
  });
});
