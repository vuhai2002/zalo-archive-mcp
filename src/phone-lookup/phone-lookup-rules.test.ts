import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyLookupError, normalizeVnPhone } from "./phone-lookup-rules.js";

describe("normalizeVnPhone", () => {
  // Cách người ta hay ghi số trong form / Excel; 9 chữ số = Excel bỏ mất số 0 đầu
  for (const raw of ["0900000001", "090 000 0001", "090.000.0001", "090-000-0001", "(090) 000 0001", "+84900000001", "84900000001", "+84 90 000 0001", "900000001"]) {
    it(`chuẩn hóa ${JSON.stringify(raw)}`, () => assert.equal(normalizeVnPhone(raw), "84900000001"));
  }

  // Chép từ danh bạ điện thoại / ứng dụng chat hay dính ký tự định hướng ẩn, dấu cách cứng, gạch kiểu khác
  for (const raw of ["‪0900000001‬", "‎0900000001", "090 000 0001", "090–000–0001", "﻿+84 900 000 001"]) {
    it(`chuẩn hóa số dính ký tự ẩn ${JSON.stringify(raw)}`, () => assert.equal(normalizeVnPhone(raw), "84900000001"));
  }

  it("nhận các đầu di động 3 / 5 / 7 / 8 / 9", () => {
    assert.deepEqual(
      ["0300000001", "0500000001", "0700000001", "0800000001"].map(normalizeVnPhone),
      ["84300000001", "84500000001", "84700000001", "84800000001"],
    );
  });

  // Hai số trong một ô, số bàn, thiếu / thừa chữ số, chữ
  for (const raw of ["", "   ", "abc", "0900000001 / 0900000002", "0900000001, 0900000002", "02800000001", "0200000001", "0900", "123456789012", "0100000001", "+1 202 000 0000"]) {
    it(`từ chối ${JSON.stringify(raw)}`, () => assert.equal(normalizeVnPhone(raw), null));
  }
});

describe("classifyLookupError", () => {
  it("216 / 212 / 210 là không có Zalo", () => {
    assert.deepEqual([216, 212, 210].map(classifyLookupError), ["no_zalo", "no_zalo", "no_zalo"]);
  });

  it("mã khác hoặc không có mã là chưa biết", () => {
    assert.equal(classifyLookupError(313), "unknown");
    assert.equal(classifyLookupError(0), "unknown");
    assert.equal(classifyLookupError(null), "unknown");
  });
});
