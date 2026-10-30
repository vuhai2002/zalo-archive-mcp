import { useState } from "react";
import type { ArchivedMessage, AttachmentInfo } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { IconDownload, IconFileText, IconImage, IconRefresh } from "../../shared/action-and-media-icons";
import { mediaStatusLabel } from "../../shared/archive-status-labels";
import { formatFileSize } from "../../shared/format-file-size";
import { canOpenInNewTab, sameOriginUrl } from "../../shared/same-origin-media-url";
import { MessageVideoTile } from "./message-video-tile";

const KIND_LABEL: Record<AttachmentInfo["kind"], string> = {
  photo: "Ảnh",
  gif: "Ảnh GIF",
  video: "Video",
  voice: "Tin nhắn thoại",
  file: "File",
  sticker: "Sticker",
};

const isImageKind = (kind: AttachmentInfo["kind"]) => kind === "photo" || kind === "gif" || kind === "sticker";

/** File gửi kèm mà thật ra là video/âm thanh (vd .mp4 gửi dạng file): phát ngay trong khung chat */
function playableKind(att: AttachmentInfo): "video" | "audio" | null {
  if (att.kind === "video") return "video";
  if (att.kind === "voice") return "audio";
  const mime = att.mime?.toLowerCase() ?? "";
  if (att.kind === "file" && mime.startsWith("video/")) return "video";
  if (att.kind === "file" && mime.startsWith("audio/")) return "audio";
  return null;
}

// Hai hàm kiểm link nằm ở module thuần; xuất lại cho chỗ gọi cũ
export { canOpenInNewTab, sameOriginUrl } from "../../shared/same-origin-media-url";

/** Nhãn trạng thái của file chưa xem được; link hết hạn có nhãn riêng */
function pendingLabel(att: AttachmentInfo, retried: boolean): string {
  if (retried || att.renewState === "waiting") return "Đang xin lại link";
  if (att.renewState === "gave_up") return "Link hết hạn, Zalo không cấp lại";
  return mediaStatusLabel(att.status);
}

/** File chưa xem được: tên + trạng thái; tải hỏng thì có nút Thử lại (xin lại link rồi tải) */
function UnavailableAttachment({ att, name, onRetried }: { att: AttachmentInfo; name: string; onRetried?: () => void }) {
  // Nhớ đúng bản `att` lúc bấm: kho trả trạng thái mới (object mới) thì hiện theo trạng thái thật
  const [retriedAtt, setRetriedAtt] = useState<AttachmentInfo | null>(null);
  const retried = retriedAtt === att;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRetry = att.status === "failed" && !retried;

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

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-black/15 bg-bubble px-3 py-2 text-[13px] text-chat-time dark:border-white/15">
      {isImageKind(att.kind) ? <IconImage size={16} /> : <IconFileText size={16} />}
      <span className="min-w-0 truncate">{name}</span>
      <span className="shrink-0 text-[12px]">· {pendingLabel(att, retried)}</span>
      {canRetry && (
        <button
          type="button"
          disabled={busy}
          onClick={retry}
          title="Xin Zalo cấp lại link rồi tải lại file"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-zalo-500 hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
        >
          <IconRefresh size={13} /> {busy ? "Đang gửi..." : "Thử lại"}
        </button>
      )}
      {error && <span className="w-full text-[12px] text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}

export function MessageAttachmentView({
  att,
  onMediaLoad,
  onRetried,
  onOpen,
  video = null,
}: {
  att: AttachmentInfo;
  onMediaLoad?: () => void;
  /** Vừa bấm Thử lại thành công: khung chat hỏi lại kho sau một lúc */
  onRetried?: () => void;
  /** Mở cửa sổ xem ảnh / video (trong khung chat); không có thì ảnh mở ở thẻ mới như trước */
  onOpen?: () => void;
  /** Thông số video Zalo gửi kèm (thời lượng, tỉ lệ) */
  video?: ArchivedMessage["video"];
}) {
  const url = att.status === "done" ? sameOriginUrl(att.url) : null;
  const name = att.fileName ?? KIND_LABEL[att.kind];

  if (!url) return <UnavailableAttachment att={att} name={name} onRetried={onRetried} />;

  if (att.kind === "sticker") {
    // Sticker hiện như Zalo: ảnh nhỏ, không khung
    return <img src={url} alt="Sticker" loading="lazy" onLoad={onMediaLoad} className="h-32 w-32 object-contain" />;
  }

  if (att.kind === "photo" || att.kind === "gif") {
    const img = (
      <img
        src={url}
        alt={name}
        loading="lazy"
        onLoad={onMediaLoad}
        className="max-h-[360px] max-w-full rounded-lg border border-black/10 bg-bubble object-contain dark:border-white/10"
      />
    );
    if (onOpen) {
      return (
        <button type="button" onClick={onOpen} title="Xem ảnh" className="block cursor-zoom-in">
          {img}
        </button>
      );
    }
    return canOpenInNewTab(att.mime) ? (
      <a href={url} target="_blank" rel="noopener noreferrer" title="Mở ảnh cỡ gốc trong tab mới" className="block cursor-zoom-in">
        {img}
      </a>
    ) : (
      img
    );
  }

  // Video Zalo: ô khung hình đầu + thời lượng + nút phát, bấm mở cửa sổ xem như Zalo PC
  if (att.kind === "video" && onOpen) return <MessageVideoTile url={url} video={video} onOpen={onOpen} onMediaLoad={onMediaLoad} />;

  const playable = playableKind(att);
  const player =
    playable === "video" ? (
      <video controls preload="metadata" src={url} onLoadedMetadata={onMediaLoad} className="max-h-80 max-w-full rounded-lg bg-black" />
    ) : playable === "audio" ? (
      <audio controls preload="none" src={url} className="w-64 max-w-full" />
    ) : null;
  // Video/voice của Zalo: chỉ trình phát. File video/âm thanh: trình phát + link tải file gốc
  if (player && att.kind !== "file") return player;

  const download = (
    <a
      href={url}
      download={att.fileName ?? true}
      className="flex items-center gap-2.5 rounded-md border border-black/10 bg-surface/80 px-3 py-2 text-chat-ink hover:bg-surface dark:border-white/10"
      title="Tải file về máy"
    >
      <IconFileText size={20} className="shrink-0 text-zalo-500" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="block text-[11px] text-ink-soft">{formatFileSize(att.sizeBytes)}</span>
      </span>
      <IconDownload size={16} className="shrink-0 text-ink-soft" />
    </a>
  );
  return player ? (
    <div className="space-y-1.5">
      {player}
      {download}
    </div>
  ) : (
    download
  );
}
