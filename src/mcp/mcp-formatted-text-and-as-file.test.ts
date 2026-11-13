import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { getOutboxItem } from "../storage/outbox-store.js";
import { draftMessageTool } from "./outbox-send-tool-handlers.js";
import { sendFileTool } from "./send-file-tool-handler.js";

const NOW = new Date("2026-03-10T07:00:00.000Z");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-dinh-dang-"));
  const dataDir = path.join(root, "data");
  const mediaRoot = path.join(dataDir, "accounts", "1", "media");
  fs.mkdirSync(mediaRoot, { recursive: true });
  const docs = path.join(root, "tai-lieu");
  fs.mkdirSync(docs);
  fs.writeFileSync(path.join(docs, "anh-mau.png"), "png");
  const db = openArchiveDatabase(":memory:");
  upsertMessage(db, sampleMessage(), { source: "live", receivedAt: NOW.toISOString() });
  const ctx = {
    db,
    env: parseEnv({ DATA_DIR: dataDir }),
    readOnly: false,
    now: () => NOW,
    mediaRoot,
    outboxFilesDir: path.join(dataDir, "accounts", "1", "outbox-files"),
  };
  return { db, ctx, docs };
}

describe("MCP: chữ kiểu markdown thành định dạng Zalo", () => {
  it("nháp có **đậm** và danh sách: lưu chữ trơn + định dạng; chữ thường thì không định dạng", () => {
    const { db, ctx } = setup();
    draftMessageTool(ctx, { thread_id: "u-lan", text: "**Chào thử**\n- Mục hai" });
    const item = getOutboxItem(db, 1)!;
    assert.equal(item.text, "Chào thử\nMục hai");
    assert.deepEqual(item.styles, [
      { start: 0, len: 8, st: "b" },
      { start: 9, len: 7, st: "lst_1" },
    ]);
    draftMessageTool(ctx, { thread_id: "u-lan", text: "Hẹn họp lúc 9h nhé" });
    assert.deepEqual(getOutboxItem(db, 2)!.styles, []);
  });
});

describe("MCP send_file: as_file", () => {
  it("as_file=true: ảnh đi thành thẻ file; chữ kèm theo cũng nhận markdown", async () => {
    const { db, ctx, docs } = setup();
    const r = await sendFileTool(ctx, {
      thread_id: "u-lan",
      file_paths: [path.join(docs, "anh-mau.png")],
      as_file: true,
      text: "*Chữ thử*",
      send_date: "2026-03-11",
      send_time: "09:00",
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    const item = getOutboxItem(db, 1)!;
    assert.deepEqual(
      item.files.map((f) => [f.name, f.kind]),
      [["anh-mau.png", "file"]],
    );
    assert.equal(item.text, "Chữ thử");
    assert.deepEqual(item.styles, [{ start: 0, len: 7, st: "i" }]);
  });

  it("mặc định ảnh vẫn là ảnh (vào chùm ảnh)", async () => {
    const { db, ctx, docs } = setup();
    await sendFileTool(ctx, { thread_id: "u-lan", file_paths: [path.join(docs, "anh-mau.png")], send_date: "2026-03-11", send_time: "09:00" });
    assert.equal(getOutboxItem(db, 1)!.files[0]!.kind, "image");
  });
});
