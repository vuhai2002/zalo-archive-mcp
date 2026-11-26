// Phát hành bản mới lên GitHub Release (người dùng đang chạy kho sẽ thấy nút "Có bản mới" trên dashboard).
// Cách dùng: pnpm release 0.5.0
// Làm lần lượt: kiểm repo sạch, đang ở main và khớp origin -> đổi version trong package.json -> commit -> tag vX.Y.Z ->
// push main + tag -> `gh release create` (ghi chú dựng từ các commit kể từ bản trước: release-notes-from-commits.ts).
// Lỗi ở bước nào thì dừng ở bước đó.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "../config/env.js";
import { githubRepoOf } from "../shared/github-release-update-check.js";
import { buildReleaseNotes } from "./release-notes-from-commits.js";
import { releaseVersionProblem } from "./release-version-rules.js";

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const fail = (msg: string): never => {
  console.error(`Dừng: ${msg}`);
  process.exit(1);
};

const pkgFile = path.join(PROJECT_ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8")) as { version: string; repository?: unknown };
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

// Ghi chú: các commit từ bản trước tới giờ (trước khi thêm commit đổi version)
let previousTag: string | null = null;
try {
  previousTag = run("git", ["describe", "--tags", "--abbrev=0"]) || null;
} catch {
  previousTag = null; // bản đầu tiên: lấy cả lịch sử
}
const subjects = run("git", ["log", "--format=%s", ...(previousTag ? [`${previousTag}..HEAD`] : [])]).split("\n").filter(Boolean);
const repo = githubRepoOf(pkg.repository);
const base = repo ? `https://github.com/${repo.owner}/${repo.repo}` : null;
const compareUrl = base ? (previousTag ? `${base}/compare/${previousTag}...${tag}` : `${base}/commits/${tag}`) : null;
const notes = buildReleaseNotes(subjects, compareUrl);

const text = fs.readFileSync(pkgFile, "utf-8").replace(/("version":\s*")[^"]+(")/, `$1${next}$2`);
fs.writeFileSync(pkgFile, text);
run("git", ["add", "package.json"]);
run("git", ["commit", "-m", `chore(release): ${tag}`]);
run("git", ["tag", "-a", tag, "-m", tag]);
run("git", ["push", "origin", "main"]);
run("git", ["push", "origin", tag]);
const url = run("gh", ["release", "create", tag, "--title", tag, "--notes", notes, "--verify-tag"]);
console.log(`Đã phát hành ${tag}: ${url}`);
console.log("Người dùng sẽ thấy nút \"Có bản mới\" trên dashboard trong vòng một giờ (mặc định; chỉnh bằng UPDATE_CHECK_INTERVAL_HOURS), hoặc ngay khi bấm \"Kiểm tra cập nhật\" ở Cài đặt > Giới thiệu.");
