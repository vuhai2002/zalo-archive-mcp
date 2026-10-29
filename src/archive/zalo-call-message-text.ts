/**
 * Tin cuộc gọi của Zalo: `chat.recommended` với action `recommened.misscall` / `calltime` /
 * `calling` / `receivecall` (Zalo tự viết sai chữ "recommended"). Zalo chỉ gửi chữ giữ chỗ
 * (title "sendBubbleMessage", description "Cuộc gọi"); app tự dựng câu từ `params`:
 * `isCaller` (nick này là người gọi), `calltype` (1 = video), `duration` (giây), `reason` (lý do
 * không thành). Logic và câu chữ chép theo Zalo Web (bundle công khai của chat.zalo.me).
 */
const CALL_ACTIONS = new Set(["recommened.misscall", "recommened.calltime", "recommened.calling", "recommened.receivecall"]);

/** `reason` của cuộc gọi không thành, theo Zalo Web */
const REASON = { calleeBusy: 1, ringTimeout: 2, calleeRejected: 3, callerCancelledRinging: 4, callerCancelled: 5 } as const;

export type CallNotice = {
  /** Dòng đầu, vd "Bạn bị nhỡ", "Cuộc gọi video đến" */
  title: string;
  /** Dòng hai: thời lượng, hoặc loại cuộc gọi khi không thành */
  detail: string;
  /** Cuộc gọi tới mình mà không nghe (nhỡ hoặc từ chối): Zalo tô đỏ tiêu đề */
  missedIncoming: boolean;
};

export function isCallAction(action: unknown): boolean {
  return typeof action === "string" && CALL_ACTIONS.has(action);
}

function parseParams(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return {};
  try {
    const p: unknown = JSON.parse(raw);
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** "41 phút 59 giây", có giờ thì "1 giờ 2 phút 5 giây" - phút luôn có, như Zalo */
export function formatCallDuration(seconds: unknown): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${h > 0 ? `${h} giờ ` : ""}${m} phút ${s} giây`;
}

/** Câu hiển thị của một tin cuộc gọi; null nếu action không phải cuộc gọi */
export function callNoticeOf(action: unknown, paramsJson: unknown): CallNotice | null {
  if (!isCallAction(action)) return null;
  const p = parseParams(paramsJson);
  const missed = action === "recommened.misscall";
  const caller = p.isCaller !== undefined && p.isCaller !== null ? Number(p.isCaller) === 1 : action === "recommened.calling";
  const kind = Number(p.calltype) === 1 ? "video" : "thoại";
  const reason = Number(p.reason);

  if (!missed) {
    return { title: `Cuộc gọi ${kind} ${caller ? "đi" : "đến"}`, detail: formatCallDuration(p.duration), missedIncoming: false };
  }
  if (caller) {
    const title =
      reason === REASON.callerCancelled || reason === REASON.callerCancelledRinging
        ? "Bạn đã hủy"
        : reason === REASON.calleeRejected
          ? "Người nhận từ chối"
          : reason === REASON.calleeBusy
            ? "Người nhận bận"
            : `Cuộc gọi ${kind} đi`;
    // Zalo Web: gọi đi mà không ai nghe (hết giờ đổ chuông / không rõ lý do) thì dòng hai là thời lượng 0
    const unanswered = !(Object.values(REASON) as number[]).includes(reason) || reason === REASON.ringTimeout;
    return { title, detail: unanswered ? formatCallDuration(0) : `Cuộc gọi ${kind}`, missedIncoming: false };
  }
  return {
    title: reason === REASON.calleeRejected ? "Bạn đã từ chối" : "Bạn bị nhỡ",
    detail: `Cuộc gọi ${kind}`,
    missedIncoming: true,
  };
}
