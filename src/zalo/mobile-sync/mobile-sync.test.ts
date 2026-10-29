import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { API } from "zca-js";
import { createSilentLogger } from "../../shared/logger.js";
import { readThread } from "../../storage/message-read-queries.js";
import { openArchiveDatabase } from "../../storage/open-archive-database.js";
import { decryptBackupKey, extractZdbBackup, generateSyncKeyPair, ZDB_CHUNK_SIZE } from "./decrypt-zdb-backup.js";
import { importMobileBackupFiles } from "./import-mobile-backup-files.js";
import { MobileSyncSession } from "./mobile-sync-session.js";
import { SyncEventType, type MobileSyncStats } from "./mobile-sync-types.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const ME = "211000000000000102";
const LAN = "5550000000000000001";
const GROUP = "6660000000000000002";
const T0 = 1767225600000;

/** Dựng bản sao lưu y định dạng Zalo: ZDB4.0 + bảng file + XZ, mã hóa AES-256-CBC IV 0 từng khối 64KB */
function buildEncryptedBackup(dir: string) {
  const { entries } = JSON.parse(fs.readFileSync(path.join(FIXTURES, "mobile-backup-two-threads.json"), "utf8")) as {
    entries: Array<{ name: string; size: number }>;
  };
  const toc = entries.map((e) => {
    const name = Buffer.from(e.name, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(name.length);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(e.size);
    return Buffer.concat([len, name, size]);
  });
  const count = Buffer.alloc(4);
  count.writeUInt32BE(entries.length);
  let plain = Buffer.concat([Buffer.from("ZDB4.0", "ascii"), Buffer.alloc(8), count, ...toc, fs.readFileSync(path.join(FIXTURES, "mobile-backup-two-threads.xz"))]);
  plain = Buffer.concat([plain, Buffer.alloc((16 - (plain.length % 16)) % 16)]);

  const rawKey = crypto.randomBytes(16);
  const aesKey = Buffer.from(rawKey.toString("hex").toUpperCase().slice(0, 32), "ascii");
  const chunks: Buffer[] = [];
  for (let off = 0; off < plain.length; off += ZDB_CHUNK_SIZE) {
    const c = crypto.createCipheriv("aes-256-cbc", aesKey, Buffer.alloc(16));
    c.setAutoPadding(false);
    chunks.push(Buffer.concat([c.update(plain.subarray(off, off + ZDB_CHUNK_SIZE)), c.final()]));
  }
  const cryptPath = path.join(dir, "backup.db.crypt");
  fs.writeFileSync(cryptPath, Buffer.concat(chunks));

  const keys = generateSyncKeyPair();
  const pub = crypto.createPublicKey({ key: Buffer.from(keys.publicKey, "base64"), format: "der", type: "spki" });
  const encryptedKey = crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_PADDING }, rawKey).toString("base64");
  return { cryptPath, keys, encryptedKey };
}

const stats = (): MobileSyncStats => ({
  conversations: 0, conversationsResolved: 0, conversationsUnresolved: 0, messagesRead: 0,
  messagesImported: 0, messagesSkipped: 0, messagesOutOfRange: 0, durationMs: 0,
});

async function importFixture(range = { fromTs: 0, toTs: 0 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-mobile-sync-"));
  const { cryptPath, keys, encryptedKey } = buildEncryptedBackup(dir);
  const { aesKey } = decryptBackupKey(keys.privateKey, encryptedKey);
  const extracted = await extractZdbBackup({ cryptPath, outDir: path.join(dir, "db"), aesKey });
  const db = openArchiveDatabase(":memory:");
  const noiseCalls: string[] = [];
  const run = async (r = range) => {
    const s = stats();
    await importMobileBackupFiles(extracted.files, {
      db,
      getNoisedIds: async ({ uids, gids }) => {
        noiseCalls.push(...uids, ...gids);
        return { fids: uids.map((u) => (u === "1001" ? LAN : "")), gids: gids.map((g) => (g === "2002" ? GROUP : "")) };
      },
      ownNoiseId: ME,
      ownPlainId: "999",
      range: r,
      stats: s,
      log: createSilentLogger(),
      shouldAbort: () => false,
      onProgress: () => {},
      onStage: () => {},
    });
    return s;
  };
  return { db, extracted, run, noiseCalls };
}

describe("đồng bộ lịch sử từ điện thoại", () => {
  it("giải khóa RSA + AES, giải nén XZ ra đúng từng file hội thoại", async () => {
    const { extracted } = await importFixture();
    assert.deepEqual(extracted.files.map((f) => [f.name, f.size]), [["1001.db", 2048], ["group_2002.db", 2048]]);
  });

  it("nhập tin vào đúng hội thoại web (đổi id điện thoại qua znoise), bỏ tin lỗi gửi; nhập lại không trùng", async () => {
    const { db, run, noiseCalls } = await importFixture();
    const first = await run();
    assert.equal(first.messagesImported, 3);
    assert.equal(first.conversationsResolved, 2);
    const dm = readThread(db, { threadId: LAN, threadType: "user", limit: 10 });
    assert.deepEqual(
      dm.map((m) => [m.text, m.isSelf, m.source, m.sentAt]),
      [
        ["Tin cũ từ điện thoại", false, "mobile_sync", new Date(T0).toISOString()],
        ["Mình trả lời trên điện thoại", true, "mobile_sync", new Date(T0 + 60_000).toISOString()],
      ],
    );
    assert.deepEqual(readThread(db, { threadId: GROUP, threadType: "group", limit: 10 }).map((m) => m.text), ["Tin nhóm cũ"]);
    assert.ok(dm.every((m) => /^7000000000\d{3}$/.test(m.msgId)), "id tin 64 bit giữ đủ chữ số");

    // Lần hai: không hỏi znoise lại (đã lưu bảng ánh xạ), không nhập trùng
    const callsBefore = noiseCalls.length;
    const second = await run();
    assert.equal(second.messagesImported, 0);
    assert.equal(noiseCalls.length, callsBefore);
  });

  it("chỉ nhập trong khoảng thời gian đã chọn", async () => {
    const { db, run } = await importFixture();
    const s = await run({ fromTs: T0 + 30_000, toTs: 0 });
    assert.equal(s.messagesImported, 2);
    assert.equal(s.messagesOutOfRange, 1);
    assert.deepEqual(readThread(db, { threadId: LAN, threadType: "user", limit: 10 }).map((m) => m.text), ["Mình trả lời trên điện thoại"]);
  });
});

describe("luồng một lượt đồng bộ", () => {
  function fakeApi() {
    const calls: Array<[string, unknown]> = [];
    const api: Record<string, unknown> = {
      listener: { on: () => {}, off: () => {}, ws: null },
      getOwnId: () => ME,
      getContext: () => ({ userAgent: "ua", cookie: { getCookieString: async () => "" } }),
      custom: (name: string) => {
        api[name] = async (props: unknown) => {
          calls.push([name, props]);
          return null;
        };
      },
    };
    return { api: api as unknown as API, calls };
  }

  it("gửi yêu cầu kèm khóa; điện thoại đồng ý thì chờ sao lưu, từ chối thì hủy; sự kiện của lượt khác bị bỏ qua", async () => {
    const { api, calls } = fakeApi();
    const s = new MobileSyncSession({ api, db: openArchiveDatabase(":memory:"), accountId: "nick-phu", workDir: os.tmpdir(), log: createSilentLogger() });
    assert.equal((await s.start({ fromTs: 0, toTs: 0 })).ok, true);
    const pull = calls.find(([n]) => n === "pullMobile")![1] as { public_key: string };
    assert.ok(pull.public_key.length > 100);
    assert.equal(s.status()?.stage, "waiting_confirm");
    assert.equal((await s.start({ fromTs: 0, toTs: 0 })).ok, false, "mỗi lúc một lượt");

    s.onSyncEvent({ type: SyncEventType.USER_CONFIRM, act: "user_confirm", act_type: "syncmsgmb", data: { user_action: 0, public_key: "khoa-khac", pc_name: "Web" } });
    assert.equal(s.status()?.stage, "waiting_confirm");
    s.onSyncEvent({ type: SyncEventType.USER_CONFIRM, act: "user_confirm", act_type: "syncmsgmb", data: { user_action: 1, public_key: pull.public_key, pc_name: "Web" } });
    assert.equal(s.status()?.stage, "waiting_backup");

    await s.cancel();
    assert.equal(s.status()?.stage, "cancelled");
    assert.ok(calls.some(([n]) => n === "cancelPullMobile"), "hủy cả yêu cầu trên máy chủ");
    s.dispose();
  });
});
