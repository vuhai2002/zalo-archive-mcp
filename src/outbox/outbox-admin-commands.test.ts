import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "../config/env-schema.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { enqueueOutboxItem, getOutboxItem } from "../storage/outbox-store.js";
import { getKillSwitch } from "../storage/send-control-store.js";
import { runOutboxAdminCommand } from "./outbox-admin-commands.js";

const env = parseEnv({});

function setup(text = "x") {
  const db = openArchiveDatabase(":memory:");
  upsertMessage(db, sampleMessage(), { source: "live", receivedAt: "2026-10-28T03:00:00.000Z" });
  const id = enqueueOutboxItem(db, {
    threadId: "u-lan", threadType: "user", text, mode: "single", notBefore: null, batchId: null,
    createdBy: "mcp", note: null, status: "draft",
  });
  const out: string[] = [];
  return { db, id, out, ctx: { db, env, io: { print: (l: string) => out.push(l) } } };
}

describe("outbox admin CLI", () => {
  it("duyệt, hủy, khóa, mở khóa", async () => {
    const { db, id, ctx } = setup();
    assert.equal(await runOutboxAdminCommand(ctx, ["approve", String(id)]), 0);
    assert.equal(getOutboxItem(db, id)!.status, "approved");
    assert.equal(await runOutboxAdminCommand(ctx, ["cancel", String(id)]), 0);
    assert.equal(getOutboxItem(db, id)!.status, "cancelled");
    await runOutboxAdminCommand(ctx, ["kill", "thử"]);
    assert.equal(getKillSwitch(db).killed, true);
    await runOutboxAdminCommand(ctx, ["unkill"]);
    assert.equal(getKillSwitch(db).killed, false);
  });

  it("hiện ký tự điều khiển thành mã, không để chúng che nội dung", async () => {
    const { id, ctx, out } = setup("an\rhiện");
    await runOutboxAdminCommand(ctx, ["show", String(id)]);
    assert.ok(out.join("\n").includes("an\\u000dhiện"));
  });
});
