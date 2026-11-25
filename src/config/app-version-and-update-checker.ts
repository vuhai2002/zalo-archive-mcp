import fs from "node:fs";
import path from "node:path";
import { createUpdateChecker, githubRepoOf, type UpdateChecker } from "../shared/github-release-update-check.js";
import type { AppEnv } from "./env-schema.js";
import { PROJECT_ROOT } from "./env.js";

/**
 * Phiên bản đang chạy + repo GitHub, đọc từ package.json ở gốc project (một nguồn: `pnpm release` đổi version ở đó).
 * Dùng chung cho daemon (dashboard) và MCP server.
 */
type PackageInfo = { version: string; repository?: unknown };

let pkg: PackageInfo | null = null;
function packageInfo(): PackageInfo {
  pkg ??= JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")) as PackageInfo;
  return pkg;
}

export const appVersion = (): string => packageInfo().version;

export function createAppUpdateChecker(env: AppEnv): UpdateChecker {
  return createUpdateChecker({
    currentVersion: appVersion(),
    repo: githubRepoOf(packageInfo().repository),
    intervalMs: env.UPDATE_CHECK_INTERVAL_HOURS * 3_600_000,
    enabled: env.UPDATE_CHECK_ENABLED,
  });
}
