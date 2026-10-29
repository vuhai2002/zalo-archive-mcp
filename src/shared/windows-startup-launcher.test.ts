import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLauncherVbs, encodeLauncher, windowsStartupDir } from "./windows-startup-launcher.js";

describe("file tự chạy daemon khi đăng nhập Windows", () => {
  it("chạy node tuyệt đối + tsx + daemon, ẩn cửa sổ, đường dẫn có dấu cách được bọc đúng nháy", () => {
    const vbs = buildLauncherVbs({ nodeExe: "C:\\Program Files\\nodejs\\node.exe", projectRoot: "C:\\Thư mục thử\\kho mẫu" });
    assert.ok(vbs.includes('sh.CurrentDirectory = "C:\\Thư mục thử\\kho mẫu"'));
    assert.ok(
      vbs.includes(
        'sh.Run """C:\\Program Files\\nodejs\\node.exe"" ""C:\\Thư mục thử\\kho mẫu\\node_modules\\tsx\\dist\\cli.mjs"" --disable-warning=ExperimentalWarning ""C:\\Thư mục thử\\kho mẫu\\src\\bin\\run-archive-daemon.ts""", 0, False',
      ),
    );
    assert.ok(vbs.includes("\r\n"), "xuống dòng kiểu Windows");
  });

  it("thư mục Startup của người dùng; file UTF-16 có BOM để giữ dấu tiếng Việt", () => {
    assert.equal(
      windowsStartupDir("C:\\Users\\a\\AppData\\Roaming"),
      "C:\\Users\\a\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup",
    );
    const buf = encodeLauncher("ạ");
    assert.deepEqual([...buf.subarray(0, 2)], [0xff, 0xfe]);
    assert.equal(buf.subarray(2).toString("utf16le"), "ạ");
  });
});
