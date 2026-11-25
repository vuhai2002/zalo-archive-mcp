// Phát hành bản mới lên GitHub Release (người dùng đang chạy kho sẽ thấy nút "Có bản mới" trên dashboard).
// Cách dùng: pnpm release 0.5.0
// Làm lần lượt: kiểm repo sạch, đang ở main và khớp origin -> đổi version trong package.json -> commit -> tag vX.Y.Z ->
// push main + tag -> `gh release create` (ghi chú tự sinh từ các commit). Lỗi ở bước nào thì dừng ở bước đó.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "../config/env.js";
import { releaseVersionProblem } from "./release-version-rules.js";

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const fail = (msg: string): never => {
  console.error(`Dừng: ${msg}`);
  process.exit(1);
};

const pkgFile = path.join(PROJECT_ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8")) as { version: string };
const next = process.argv[2];
const problem = releaseVersionProblem(pkg.version, next);
if (problem) fail(problem);
const tag = `v${next}`;

if (run("git", ["status", "--porcelain"])) fail("còn thay đổi chưa commit - commit hoặc bỏ trước khi phát hành");
if (run("git", ["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") fail("chỉ phát hành từ nhánh main");
run("git", ["fetch", "origin", "--tags"]);
if (run("git", ["rev-list", "--left-right", "--count", "main...origin/main"]).replace(/\s+/g, " ") !== "0 0") fail("main chưa khớp origin/main - pull / push trước");
if (run("git", ["tag", "--list", tag])) fail(`tag ${tag} đã có`);
try {
  run("gh", ["auth", "status"]);
} catch {
  fail("chưa đăng nhập GitHub CLI - chạy `gh auth login` trước");
}

const text = fs.readFileSync(pkgFile, "utf-8").replace(/("version":\s*")[^"]+(")/, `$1${next}$2`);
fs.writeFileSync(pkgFile, text);
run("git", ["add", "package.json"]);
run("git", ["commit", "-m", `chore(release): ${tag}`]);
run("git", ["tag", "-a", tag, "-m", tag]);
run("git", ["push", "origin", "main"]);
run("git", ["push", "origin", tag]);
const url = run("gh", ["release", "create", tag, "--title", tag, "--generate-notes", "--verify-tag"]);
console.log(`Đã phát hành ${tag}: ${url}`);
console.log("Người dùng sẽ thấy nút \"Có bản mới\" trên dashboard trong vòng vài giờ (theo UPDATE_CHECK_INTERVAL_HOURS).");
