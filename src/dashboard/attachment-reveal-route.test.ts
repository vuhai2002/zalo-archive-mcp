import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { REAL_NAME_DIR } from "../media/real-name-file-links.js";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { markAttachmentDone } from "../storage/attachment-queue-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

describe("POST /api/attachments/:id/reveal: mở thư mục chứa file", () => {
  it("file đã tải: tạo bản tên thật rồi mở Explorer ở đó; chưa tải hay đường dẫn thoát khỏi media thì 404", async () => {
    const revealed: string[] = [];
    const h = await createDashboardHarness({ revealFile: async (f) => void revealed.push(f) });
    const { db, paths } = h.nick("test");
    upsertMessage(
      db,
      sampleMessage({ attachments: [{ kind: "file", remoteUrl: "https://f1.zdn.vn/a.zip", fileName: "ho-so-thu-nghiem.zip", declaredSize: null }] }),
      { source: "live", receivedAt: "2026-03-10T07:00:00.000Z" },
    );
    const cookie = await h.login();
    const reveal = () => h.call("/api/attachments/1/reveal", { ...h.json({}), cookie });

    assert.equal((await reveal()).status, 404, "chưa tải");
    fs.mkdirSync(path.join(paths.mediaDir, "ab"), { recursive: true });
    fs.writeFileSync(path.join(paths.mediaDir, "ab", "abcd.zip"), "noi dung");
    markAttachmentDone(db, 1, { localPath: "ab/abcd.zip", sha256: "abcd", sizeBytes: 8, mime: null });

    const res = await reveal();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, fileName: "ho-so-thu-nghiem.zip", realName: true });
    assert.deepEqual(revealed, [path.join(path.dirname(path.resolve(paths.mediaDir)), REAL_NAME_DIR, "ho-so-thu-nghiem.zip")]);
    assert.equal(fs.readFileSync(revealed[0]!, "utf-8"), "noi dung");

    db.prepare("UPDATE attachments SET local_path = '../../credentials.enc' WHERE id = 1").run();
    assert.equal((await reveal()).status, 404, "không thoát khỏi thư mục media");
    assert.equal(revealed.length, 1);
  });
});
