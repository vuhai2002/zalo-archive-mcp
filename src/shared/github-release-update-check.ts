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
  /** Lần hỏi GitHub gần nhất (ISO); null khi chưa hỏi lần nào */
  checkedAt: string | null;
};
export type GithubRepo = { owner: string; repo: string };
export type UpdateChecker = {
  /** `force`: bỏ qua nhịp thường (nút "Kiểm tra cập nhật"), vẫn giữ tối thiểu 1 phút giữa hai lần hỏi thật */
  check: (opts?: { force?: boolean }) => Promise<UpdateInfo>;
  /** Kết quả gần nhất đã có (không hỏi mạng); null khi chưa hỏi lần nào */
  peek: () => UpdateInfo | null;
};

const API = "https://api.github.com";
const TIMEOUT_MS = 5_000;
/** Hỏi hỏng thì thử lại sớm hơn nhịp thường, nhưng không dồn dập */
const RETRY_AFTER_FAIL_MS = 30 * 60_000;
const MAX_NOTES = 2_000;
/** Bấm "Kiểm tra cập nhật" liên tục: mỗi phút tối đa một lần hỏi GitHub thật */
const FORCE_MIN_GAP_MS = 60_000;

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
  const none = (enabled: boolean, checkedAt: string | null = null): UpdateInfo => ({
    enabled,
    current: o.currentVersion,
    latest: null,
    updateAvailable: false,
    releaseUrl: null,
    notes: null,
    checkedAt,
  });
  let cache: { at: number; ttl: number; info: UpdateInfo } | null = null;
  let inFlight: Promise<UpdateInfo> | null = null;
  // ETag của lần trả lời gần nhất: GitHub trả 304 (không tính vào giới hạn lượt hỏi) khi Release chưa đổi
  let lastGood: { etag: string; info: UpdateInfo } | null = null;

  async function ask(): Promise<UpdateInfo> {
    const checkedAt = new Date(now()).toISOString();
    if (!o.repo) return none(true, checkedAt);
    try {
      const res = await (o.fetchFn ?? fetch)(`${API}/repos/${o.repo.owner}/${o.repo.repo}/releases/latest`, {
        headers: {
          "User-Agent": "zalo-archive-mcp-update-check",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(lastGood ? { "If-None-Match": lastGood.etag } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 304 && lastGood) return { ...lastGood.info, checkedAt };
      if (!res.ok) return none(true, checkedAt);
      const data = (await res.json()) as { tag_name?: unknown; body?: unknown };
      if (typeof data.tag_name !== "string" || !/^v?\d+(\.\d+)*/.test(data.tag_name)) return none(true, checkedAt);
      const latest = data.tag_name.replace(/^v/i, "");
      const body = typeof data.body === "string" ? data.body.trim() : "";
      const info: UpdateInfo = {
        enabled: true,
        current: o.currentVersion,
        latest,
        updateAvailable: compareVersions(latest, o.currentVersion) > 0,
        releaseUrl: `https://github.com/${o.repo.owner}/${o.repo.repo}/releases/tag/${encodeURIComponent(data.tag_name)}`,
        notes: body ? (body.length > MAX_NOTES ? `${body.slice(0, MAX_NOTES)}...` : body) : null,
        checkedAt,
      };
      const etag = res.headers.get("etag");
      lastGood = etag ? { etag, info } : null;
      return info;
    } catch {
      return none(true, checkedAt);
    }
  }

  return {
    peek: () => cache?.info ?? null,
    check: async (opts = {}) => {
      if (o.enabled === false) return none(false);
      // Người dùng bấm "Kiểm tra cập nhật": hỏi lại ngay, nhưng mỗi phút tối đa một lần hỏi thật
      const fresh = cache && now() - cache.at < (opts.force ? FORCE_MIN_GAP_MS : cache.ttl);
      if (fresh) return cache!.info;
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
