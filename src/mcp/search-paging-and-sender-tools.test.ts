import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseEnv } from "../config/env-schema.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertContacts } from "../storage/contact-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { createArchiveMcpServer } from "./create-archive-mcp-server.js";

const live = { source: "live" as const, receivedAt: "2026-03-10T07:00:00.000Z" };
const at = (min: number) => new Date(Date.UTC(2026, 2, 10, 7, min)).toISOString();

async function client() {
  const db = openArchiveDatabase(":memory:");
  db.prepare("INSERT INTO meta (key, value) VALUES ('self_uid', 'u-toi')").run();
  let n = 0;
  const add = (threadId: string, senderId: string, senderName: string, text: string, isSelf = false) => {
    n++;
    upsertMessage(
      db,
      sampleMessage({ msgId: String(n), cliMsgId: `c${n}`, threadId, threadType: "group", senderId, senderName, isSelf, text, sentAt: at(n) }),
      live,
    );
  };
  for (let i = 0; i < 25; i++) add("g-1", "u-lan", "Lan", `Tin họp số ${i}`);
  add("g-1", "u-minh", "Minh", "Hẹn họp lúc 9h nhé");
  add("g-1", "u-toi", "Tôi", "Đã nhận", true);
  add("g-2", "u-lan-2", "Lan", "Tin thử của nhóm mẫu");
  upsertContacts(db, [
    { userId: "u-lan", displayName: "Lan", avatarUrl: null },
    { userId: "u-lan-2", displayName: "Lan", avatarUrl: null },
  ]);
  const server = createArchiveMcpServer({ db, env: parseEnv({}), mediaRoot: "/media", accountId: "test", readOnly: false });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), c.connect(clientT)]);
  return async (name: string, args: Record<string, unknown>) =>
    (((await c.callTool({ name, arguments: args })) as { content: Array<{ text: string }> }).content[0]!.text);
}

describe("MCP: tìm có phân trang, lọc người gửi theo tên / tin của tôi, read_thread báo còn bao nhiêu", () => {
  it("search_messages báo tổng số và cách lấy trang tiếp; trang cuối nói đã hết", async () => {
    const call = await client();
    const p1 = await call("search_messages", { sender_name: "lan", thread_id: "g-1" });
    assert.match(p1, /^25 tin khớp \(lọc người gửi sender_id=u-lan\)\. Trang này: tin 1-20, mới nhất trước\./);
    assert.match(p1, /Còn 5 tin: gọi lại với offset=20/);
    const p2 = await call("search_messages", { sender_name: "lan", thread_id: "g-1", offset: 20 });
    assert.match(p2, /Trang này: tin 21-25/);
    assert.match(p2, /Đã hết kết quả\./);
    assert.match(await call("search_messages", { query: "hop", offset: 100 }), /26 tin khớp.*không còn tin nào từ offset=100/s);
  });

  it("sender_name trùng nhiều người: liệt kê để chọn sender_id, không đoán; không ai khớp thì báo rõ", async () => {
    const call = await client();
    const many = await call("search_messages", { sender_name: "lan" });
    assert.match(many, /2 người gửi khớp "lan"/);
    assert.match(many, /sender_id=u-lan \| 25 tin/);
    assert.match(many, /sender_id=u-lan-2 \| 1 tin/);
    assert.match(await call("search_messages", { sender_name: "không ai tên vậy" }), /Không thấy người gửi nào tên/);
  });

  it("from_me lấy tin của chính mình; dùng chung với sender_id thì báo lỗi", async () => {
    const call = await client();
    assert.match(await call("search_messages", { from_me: true }), /^1 tin khớp \(tin của bạn\)/);
    assert.match(await call("search_messages", { from_me: true, sender_id: "u-lan" }), /Chỉ dùng một trong sender_id, sender_name, from_me/);
  });

  it("read_thread nói hội thoại có bao nhiêu tin, còn bao nhiêu tin cũ hơn / mới hơn", async () => {
    const call = await client();
    const latest = await call("read_thread", { thread_id: "g-1", limit: 10 });
    assert.match(latest, /Hội thoại có 27 tin; trang này 10 tin\. Còn 17 tin cũ hơn \(before_id=\d+\), không còn tin mới hơn\./);
  });
});
