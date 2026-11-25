import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseEnv } from "../config/env-schema.js";
import type { UpdateChecker, UpdateInfo } from "../shared/github-release-update-check.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { createArchiveMcpServer } from "./create-archive-mcp-server.js";

const base: UpdateInfo = { enabled: true, current: "0.4.0", latest: null, updateAvailable: false, releaseUrl: null, notes: null, checkedAt: null };

async function syncStatus(updates?: UpdateChecker) {
  const db = openArchiveDatabase(":memory:");
  const server = createArchiveMcpServer({ db, env: parseEnv({}), mediaRoot: "/media", accountId: "test", readOnly: false }, { updates });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  const r = await client.callTool({ name: "sync_status", arguments: {} });
  return (r as { content: Array<{ text: string }> }).content[0]!.text;
}

describe("sync_status nhắc có bản mới", () => {
  it("đã biết có bản mới: thêm một dòng chỉ cách cập nhật; không chờ mạng (dùng kết quả đã có, hỏi lại ở nền)", async () => {
    let asked = 0;
    const known: UpdateInfo = { ...base, latest: "0.5.0", updateAvailable: true };
    const text = await syncStatus({ peek: () => known, check: async () => (asked++, known) });
    assert.match(text, /Có bản mới v0\.5\.0 .*đang chạy v0\.4\.0.*mục "Cập nhật" trong README\.md/);
    assert.equal(asked, 1, "hỏi lại ở nền để lần sau có kết quả mới");
  });

  it("không có bản mới, chưa biết hay không có bộ kiểm tra: không nhắc gì", async () => {
    for (const updates of [undefined, { peek: () => null, check: async () => base }, { peek: () => ({ ...base, latest: "0.4.0" }), check: async () => base }]) {
      assert.doesNotMatch(await syncStatus(updates), /Có bản mới/);
    }
  });
});
