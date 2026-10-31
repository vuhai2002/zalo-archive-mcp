import { useState } from "react";
import type { AttachmentInfo } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { IconFileText, IconImage, IconRefresh } from "../../shared/action-and-media-icons";
import { mediaStatusLabel } from "../../shared/archive-status-labels";

const isImageKind = (kind: AttachmentInfo["kind"]) => kind === "photo" || kind === "gif" || kind === "sticker";

/** Chữ Zalo dùng cho file đã bị xóa khỏi máy chủ (STR_CLOUD_PHOTO_EXPIRED, ..._VIDEO_EXPIRED, STR_BIG_FILE_EXPIRED) */
const EXPIRED_LABEL: Record<AttachmentInfo["kind"], string> = {
  photo: "Ảnh đã hết hạn",
  gif: "Ảnh đã hết hạn",
  sticker: "Ảnh đã hết hạn",
  video: "Video đã hết hạn",
  voice: "Tin nhắn thoại đã hết hạn",
  file: "File đã hết hạn",
};
const EXPIRED_HINT =
  "Zalo chỉ giữ file trên máy chủ một thời gian rồi xóa. File này bị xóa trước khi kho kịp tải nên không xem được nữa.";

/** Nhãn trạng thái của file chưa xem được; link hết hạn có nhãn riêng */
function statusLabel(att: AttachmentInfo, retried: boolean): string {
  if (retried || att.renewState === "waiting") return "Đang xin lại link";
  if (att.renewState === "gave_up") return "Link hết hạn, Zalo không cấp lại";
  return mediaStatusLabel(att.status);
}

/** Nút Thử lại: xin Zalo cấp lại link rồi tải lại; nhớ đúng bản `att` lúc bấm để hiện "Đang xin lại link" */
function useRetry(att: AttachmentInfo, onRetried?: () => void) {
  const [retriedAtt, setRetriedAtt] = useState<AttachmentInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retried = retriedAtt === att;
  async function retry() {
    setBusy(true);
    setError(null);
    try {
      await api.attachmentRetry(att.id);
      setRetriedAtt(att);
      onRetried?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  // File Zalo đã xóa thì xin lại cũng vô ích: không có nút
  const canRetry = att.status === "failed" && att.renewState !== "deleted" && !retried;
  return { retried, busy, error, canRetry, retry };
}

/**
 * File chưa xem được trong khung chat: tên + trạng thái, tải hỏng thì có nút Thử lại. File Zalo đã xóa
 * khỏi máy chủ hiện đúng chữ của Zalo ("Ảnh đã hết hạn", "File đã hết hạn"), không có nút.
 * `compact` = ô vuông nhỏ trong album ảnh: biểu tượng + chữ ngắn ở giữa.
 */
export function UnavailableAttachment({
  att,
  name,
  onRetried,
  compact = false,
}: {
  att: AttachmentInfo;
  name: string;
  onRetried?: () => void;
  compact?: boolean;
}) {
  const r = useRetry(att, onRetried);
  const deleted = att.renewState === "deleted";
  const Icon = isImageKind(att.kind) ? IconImage : IconFileText;
  const retryButton = r.canRetry && (
    <button
      type="button"
      disabled={r.busy}
      onClick={r.retry}
      title="Xin Zalo cấp lại link rồi tải lại file"
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-zalo-500 hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
    >
      <IconRefresh size={13} /> {r.busy ? "Đang gửi..." : "Thử lại"}
    </button>
  );

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1 text-center text-[11.5px] leading-tight text-chat-time" title={deleted ? EXPIRED_HINT : undefined}>
        <Icon size={18} />
        <span>{deleted ? "Đã hết hạn" : statusLabel(att, r.retried)}</span>
        {retryButton}
      </div>
    );
  }

  // Ảnh / video Zalo đã xóa: chỉ một câu như Zalo; file thì giữ tên file để biết là file nào
  const label = deleted ? (att.kind === "file" ? `${name} · Đã hết hạn` : EXPIRED_LABEL[att.kind]) : null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-black/15 bg-bubble px-3 py-2 text-[13px] text-chat-time dark:border-white/15"
      title={deleted ? EXPIRED_HINT : undefined}
    >
      <Icon size={16} />
      {label ? (
        <span className="min-w-0 truncate">{label}</span>
      ) : (
        <>
          <span className="min-w-0 truncate">{name}</span>
          <span className="shrink-0 text-[12px]">· {statusLabel(att, r.retried)}</span>
        </>
      )}
      {retryButton}
      {r.error && <span className="w-full text-[12px] text-red-600 dark:text-red-400">{r.error}</span>}
    </div>
  );
}
