/**
 * Kiểm tra trên GitHub Release có bản mới hơn bản đang chạy không, để dashboard hiện nút "Có bản mới" (bấm ra prompt đưa
 * agent tự cập nhật) và `sync_status` của MCP nhắc được. Chỉ hỏi GitHub Release (không phải từng commit), cache theo nhịp,
 * hỏi chung một lượt khi nhiều nơi gọi cùng lúc. Mọi sự cố (mất mạng, GitHub lỗi, không biết repo) thì coi như không có bản
 * mới - không bao giờ chặn hay làm phiền người dùng.
 */
export type UpdateInfo = {
  /** false khi tắt bằng UPDATE_CHECK_ENABLED */
  enabled: boolean;
  current: string;
  /** Bản mới nhất trên GitHub Release (bỏ tiền tố v); null khi chưa lấy được */
  latest: string | null;
  updateAvailable: boolean;
  /** Link trang release TỰ DỰNG từ owner/repo/tag, không lấy từ phản hồi của GitHub */
  releaseUrl: string | null;
  /** Ghi chú phát hành (chữ thô, đã cắt ngắn) */
  notes: string | null;
};
export type GithubRepo = { owner: string; repo: string };
export type UpdateChecker = {
  check: () => Promise<UpdateInfo>;
  /** Kết quả gần nhất đã có (không hỏi mạng); null khi chưa hỏi lần nào */
  peek: () => UpdateInfo | null;
};

const API = "https://api.github.com";
const TIMEOUT_MS = 5_000;
/** Hỏi hỏng thì thử lại sớm hơn nhịp thường, nhưng không dồn dập */
const RETRY_AFTER_FAIL_MS = 30 * 60_000;
const MAX_NOTES = 2_000;

/** So hai phiên bản dạng 1.2.3 (bỏ tiền tố v, bỏ phần sau dấu -): 1 / 0 / -1 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/i, "").split("-")[0]!.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** owner/repo từ trường `repository` của package.json ("github:a/b" hoặc { url: "...github.com/a/b.git" }) */
export function githubRepoOf(repository: unknown): GithubRepo | null {
  const raw = typeof repository === "string" ? repository : (repository as { url?: unknown } | null)?.url;
  if (typeof raw !== "string") return null;
  const m = raw.match(/^github:([\w.-]+)\/([\w.-]+)$/i) ?? raw.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return m ? { owner: m[1]!, repo: m[2]! } : null;
}

export function createUpdateChecker(o: {
  currentVersion: string;
  repo: GithubRepo | null;
  intervalMs: number;
  enabled?: boolean;
  fetchFn?: typeof fetch;
  now?: () => number;
}): UpdateChecker {
  const now = o.now ?? Date.now;
  const none = (enabled: boolean): UpdateInfo => ({ enabled, current: o.currentVersion, latest: null, updateAvailable: false, releaseUrl: null, notes: null });
  let cache: { at: number; ttl: number; info: UpdateInfo } | null = null;
  let inFlight: Promise<UpdateInfo> | null = null;

  async function ask(): Promise<UpdateInfo> {
    if (!o.repo) return none(true);
    try {
      const res = await (o.fetchFn ?? fetch)(`${API}/repos/${o.repo.owner}/${o.repo.repo}/releases/latest`, {
        headers: { "User-Agent": "zalo-archive-mcp-update-check", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return none(true);
      const data = (await res.json()) as { tag_name?: unknown; body?: unknown };
      if (typeof data.tag_name !== "string" || !/^v?\d+(\.\d+)*/.test(data.tag_name)) return none(true);
      const latest = data.tag_name.replace(/^v/i, "");
      const body = typeof data.body === "string" ? data.body.trim() : "";
      return {
        enabled: true,
        current: o.currentVersion,
        latest,
        updateAvailable: compareVersions(latest, o.currentVersion) > 0,
        releaseUrl: `https://github.com/${o.repo.owner}/${o.repo.repo}/releases/tag/${encodeURIComponent(data.tag_name)}`,
        notes: body ? (body.length > MAX_NOTES ? `${body.slice(0, MAX_NOTES)}...` : body) : null,
      };
    } catch {
      return none(true);
    }
  }

  return {
    peek: () => cache?.info ?? null,
    check: async () => {
      if (o.enabled === false) return none(false);
      if (cache && now() - cache.at < cache.ttl) return cache.info;
      inFlight ??= ask()
        .then((info) => {
          cache = { at: now(), ttl: info.latest ? o.intervalMs : Math.min(o.intervalMs, RETRY_AFTER_FAIL_MS), info };
          return info;
        })
        .finally(() => (inFlight = null));
      return inFlight;
    },
  };
}
