import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DownloadAbortedError, type BackupDownloadOptions } from "./download-mobile-backup.js";
import { describeBackupInfo, downloadBackupWithRetry } from "./download-mobile-backup-with-retry.js";
import type { TSyncEventSyncMsgInfo } from "./mobile-sync-types.js";

const opts: BackupDownloadOptions = { url: "https://trans-bin.zaloapp.com/download/a/b?t=1", userAgent: "ua", sessionCookie: "c", destPath: "x" };

function fake(results: Array<Error | "ok">) {
  let calls = 0;
  const sleeps: number[] = [];
  const retries: Array<[number, number, string]> = [];
  return {
    deps: {
      download: async () => {
        const r = results[calls++];
        if (r === "ok") return { bytes: 10 };
        throw r;
      },
      sleep: async (ms: number) => void sleeps.push(ms),
      onRetry: (retry: number, of: number, err: Error) => void retries.push([retry, of, err.message]),
    },
    calls: () => calls,
    sleeps,
    retries,
  };
}

describe("tải bản sao lưu điện thoại: thử lại như Zalo PC", () => {
  it("máy chủ chưa có file (404) thì thử lại sau 5 giây, tối đa 2 lần; được thì thôi", async () => {
    const f = fake([new Error("Tải bản sao lưu thất bại (HTTP 404)"), "ok"]);
    assert.deepEqual(await downloadBackupWithRetry(opts, f.deps), { bytes: 10 });
    assert.equal(f.calls(), 2);
    assert.deepEqual(f.sleeps, [5_000]);
    assert.deepEqual(f.retries, [[1, 2, "Tải bản sao lưu thất bại (HTTP 404)"]]);
  });

  it("hỏng cả 3 lần thì báo lỗi kèm số lần đã thử", async () => {
    const e = new Error("Tải bản sao lưu thất bại (HTTP 404)");
    const f = fake([e, e, e]);
    await assert.rejects(downloadBackupWithRetry(opts, f.deps), /HTTP 404\) - đã thử 3 lần/);
    assert.equal(f.calls(), 3);
    assert.deepEqual(f.sleeps, [5_000, 5_000]);
  });

  it("hủy giữa chừng hay đầy đĩa thì không thử lại", async () => {
    const aborted = fake([new DownloadAbortedError()]);
    await assert.rejects(downloadBackupWithRetry(opts, aborted.deps), DownloadAbortedError);
    const full = fake([Object.assign(new Error("ghi đĩa"), { code: "ENOSPC" })]);
    await assert.rejects(downloadBackupWithRetry(opts, full.deps), /ghi đĩa/);
    assert.equal(aborted.calls() + full.calls(), 2);

    let cancelled = false;
    const f = fake([new Error("HTTP 404"), "ok"]);
    const onRetry = f.deps.onRetry;
    f.deps.onRetry = (...a) => ((cancelled = true), onRetry(...a));
    await assert.rejects(downloadBackupWithRetry({ ...opts, shouldAbort: () => cancelled }, f.deps), DownloadAbortedError);
    assert.equal(f.calls(), 1, "bấm hủy trong lúc chờ thì không tải lại");
  });

  it("log thông tin bản sao lưu: cỡ, số tin, host - không có link đầy đủ hay khóa", () => {
    const info = {
      uid: 1,
      url: "https://trans-bin.zaloapp.com/download/secret/path?token=abc",
      file_name: "b",
      public_key: "PUB",
      encrypted_key: "KEY",
      file_size: 123456,
      is_full_transfer: 1,
      from_seq_id: 0,
    } as TSyncEventSyncMsgInfo;
    const d = describeBackupInfo(info, { db_format: 1, origin_db: { msg_total: 500000, msg_thread: 900 } });
    assert.deepEqual([d.host, d.fileSize, d.isFullTransfer, d.dbFormat, d.originDb], ["trans-bin.zaloapp.com", 123456, 1, 1, { msg_total: 500000, msg_thread: 900 }]);
    assert.doesNotMatch(JSON.stringify(d), /secret|token|PUB|KEY/);
  });
});
