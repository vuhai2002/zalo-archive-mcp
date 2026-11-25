import { compareVersions } from "../shared/github-release-update-check.js";

/** Bản phát hành mới phải dạng X.Y.Z và lớn hơn bản hiện tại; trả lý do khi không hợp lệ, null khi được */
export function releaseVersionProblem(current: string, next: string | undefined): string | null {
  if (!next || !/^\d+\.\d+\.\d+$/.test(next)) return "Cần số phiên bản dạng X.Y.Z, vd: pnpm release 0.5.0";
  if (compareVersions(next, current) <= 0) return `Bản mới (${next}) phải lớn hơn bản hiện tại (${current})`;
  return null;
}
