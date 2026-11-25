import fs from "node:fs";
import path from "node:path";
import type { AppAbout } from "../dashboard/dashboard-api-contract.js";
import { createUpdateChecker, githubRepoOf, type UpdateChecker } from "../shared/github-release-update-check.js";
import type { AppEnv } from "./env-schema.js";
import { PROJECT_ROOT } from "./env.js";

/**
 * Phiên bản đang chạy, repo GitHub và tác giả, đọc từ package.json ở gốc project (một nguồn: `pnpm release` đổi version ở
 * đó, tác giả ghi ở trường `author`). Dùng chung cho daemon (dashboard) và MCP server.
 */
type PackageInfo = { version: string; repository?: unknown; author?: unknown };

let pkg: PackageInfo | null = null;
function packageInfo(): PackageInfo {
  pkg ??= JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")) as PackageInfo;
  return pkg;
}

export const appVersion = (): string => packageInfo().version;

/** Trường `author` của package.json: "Tên <email> (url)" hoặc { name, url } -> tên + link (bỏ email) */
export function authorOf(author: unknown): { name: string | null; url: string | null } {
  if (author && typeof author === "object") {
    const a = author as { name?: unknown; url?: unknown };
    return { name: typeof a.name === "string" ? a.name : null, url: typeof a.url === "string" ? a.url : null };
  }
  if (typeof author !== "string" || !author.trim()) return { name: null, url: null };
  const url = /\((https?:\/\/[^)\s]+)\)\s*$/.exec(author)?.[1] ?? null;
  const name = author.replace(/\((https?:\/\/[^)\s]+)\)\s*$/, "").replace(/<[^>]*>/, "").trim();
  return { name: name || null, url };
}

export function appAbout(): AppAbout {
  const p = packageInfo();
  const repo = githubRepoOf(p.repository);
  const author = authorOf(p.author);
  return {
    version: p.version,
    authorName: author.name,
    authorUrl: author.url,
    repoUrl: repo ? `https://github.com/${repo.owner}/${repo.repo}` : null,
  };
}

export function createAppUpdateChecker(env: AppEnv): UpdateChecker {
  return createUpdateChecker({
    currentVersion: appVersion(),
    repo: githubRepoOf(packageInfo().repository),
    intervalMs: env.UPDATE_CHECK_INTERVAL_HOURS * 3_600_000,
    enabled: env.UPDATE_CHECK_ENABLED,
  });
}
