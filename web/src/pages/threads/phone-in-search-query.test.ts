import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phoneInQuery } from "./phone-in-search-query";

describe("ô Tìm kiếm: nhận ra số điện thoại", () => {
  it("các kiểu viết số di động thành 0xxxxxxxxx; chữ, số ngắn, số bàn thì không", () => {
    for (const q of ["0900000001", "0900 000 001", "090.000.0001", "+84900000001", "84900000001", "900000001"]) {
      assert.equal(phoneInQuery(q), "0900000001", q);
    }
    for (const q of ["Lan", "0900", "02800000001", "09000000012", "hẹn 0900000001"]) assert.equal(phoneInQuery(q), null, q);
  });
});
