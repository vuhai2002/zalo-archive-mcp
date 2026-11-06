import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openArchiveDatabase } from "./open-archive-database.js";

describe("trang Tổng quan không quét cả bảng tin", () => {
  it("đếm tin theo nguồn đọc chỉ mục nguồn, không đọc từng dòng tin (kho rất nhiều tin: quét cả bảng rất chậm)", () => {
    const db = openArchiveDatabase(":memory:");
    const plan = db
      .prepare("EXPLAIN QUERY PLAN SELECT source AS k, COUNT(*) AS n FROM messages GROUP BY source")
      .all()
      .map((r) => String((r as { detail: unknown }).detail))
      .join(" | ");
    assert.match(plan, /USING COVERING INDEX messages_source/);
  });
});
