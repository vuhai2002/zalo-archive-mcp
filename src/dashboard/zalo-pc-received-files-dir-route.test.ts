import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { FolderPicker } from "../shared/windows-folder-picker-dialog.js";
import type { ZaloPcMediaImportStatus } from "./dashboard-api-contract.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

const URL = "/api/zalo-pc-media/received-files-dir";

async function setup(pickFolder?: FolderPicker) {
  const h = await createDashboardHarness({ pickFolder });
  const cookie = await h.login();
  const save = (dir: unknown) => h.call(URL, { ...h.json({ dir }), cookie });
  const pick = () => h.call(`${URL}/pick`, { ...h.json({}), cookie });
  const status = async () => (await (await h.call("/api/zalo-pc-media", { cookie })).json()) as ZaloPcMediaImportStatus;
  return { save, pick, status };
}

describe("Cài đặt > Đồng bộ: chọn thư mục Zalo PC lưu file (Zalo Received Files)", () => {
  it("lưu thư mục có thật, dò nó đầu tiên; bỏ dấu ngoặc kép khi dán; bỏ chọn được", async () => {
    const { save, status } = await setup();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-received-"));
    assert.equal((await status()).receivedFilesDir, null);

    const res = await save(`  "${dir}"  `);
    assert.equal(res.status, 200);
    const s = (await res.json()) as ZaloPcMediaImportStatus;
    assert.equal(s.receivedFilesDir, path.resolve(dir));
    assert.equal(s.receivedFilesDirs[0], path.resolve(dir), "thư mục đã chọn được dò trước");
    assert.equal((await status()).receivedFilesDir, path.resolve(dir), "giữ sau khi tải lại");

    const cleared = (await (await save(null)).json()) as ZaloPcMediaImportStatus;
    assert.equal(cleared.receivedFilesDir, null);
    assert.ok(!cleared.receivedFilesDirs.includes(path.resolve(dir)));
  });

  it("từ chối đường dẫn tương đối, không có trên máy, hay là file; giữ nguyên lựa chọn cũ", async () => {
    const { save, status } = await setup();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-received-"));
    const file = path.join(dir, "tai-lieu-mau.pdf");
    fs.writeFileSync(file, "x");
    await save(dir);
    for (const bad of ["Zalo Received Files", path.join(dir, "thu-muc-chua-tao"), file, 42]) {
      const res = await save(bad);
      assert.equal(res.status, 400, String(bad));
      assert.match(((await res.json()) as { error: string }).error, /thư mục/i);
    }
    assert.equal((await status()).receivedFilesDir, path.resolve(dir));
  });

  it("nút chọn thư mục: mở hộp thoại tại thư mục đang chọn, lưu thư mục chọn được; Hủy thì giữ nguyên; mỗi lúc một hộp thoại", async () => {
    const first = fs.mkdtempSync(path.join(os.tmpdir(), "zam-received-"));
    const second = fs.mkdtempSync(path.join(os.tmpdir(), "zam-received-"));
    const asked: Array<string | null> = [];
    let answer: string | null = first;
    const gate: { release?: () => void } = {};
    const { pick, status } = await setup(async ({ initialDir }) => {
      asked.push(initialDir);
      if (answer === "chờ") await new Promise<void>((r) => (gate.release = r));
      return answer === "chờ" ? second : answer;
    });

    assert.equal(((await (await pick()).json()) as ZaloPcMediaImportStatus).receivedFilesDir, path.resolve(first));
    answer = null; // bấm Hủy
    const cancelled = await pick();
    assert.equal(cancelled.status, 200);
    assert.equal(((await cancelled.json()) as ZaloPcMediaImportStatus).receivedFilesDir, path.resolve(first));
    assert.equal(asked[1], path.resolve(first), "mở sẵn ở thư mục đang chọn");

    answer = "chờ";
    const open = pick();
    while (!gate.release) await new Promise((r) => setTimeout(r, 5));
    assert.equal((await pick()).status, 409, "đang có hộp thoại mở");
    gate.release();
    assert.equal(((await (await open).json()) as ZaloPcMediaImportStatus).receivedFilesDir, path.resolve(second));
    assert.equal((await status()).receivedFilesDir, path.resolve(second));
  });

  it("hộp thoại không mở được thì báo lỗi, không đổi lựa chọn", async () => {
    const { pick, status } = await setup(async () => {
      throw new Error("Hộp thoại chọn thư mục chỉ có trên Windows");
    });
    const res = await pick();
    assert.equal(res.status, 500);
    assert.match(((await res.json()) as { error: string }).error, /Windows/);
    assert.equal((await status()).receivedFilesDir, null);
  });
});
