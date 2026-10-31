import type { ArchivedMessage, AttachmentInfo } from "../../archive-api-types";
import { IconDownload, IconFileText } from "../../shared/action-and-media-icons";
import { formatFileSize } from "../../shared/format-file-size";
import { canOpenInNewTab, sameOriginUrl } from "../../shared/same-origin-media-url";
import { MessageVideoTile } from "./message-video-tile";
import { UnavailableAttachment } from "./unavailable-attachment";

const KIND_LABEL: Record<AttachmentInfo["kind"], string> = {
  photo: "Ảnh",
  gif: "Ảnh GIF",
  video: "Video",
  voice: "Tin nhắn thoại",
  file: "File",
  sticker: "Sticker",
};

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

export function MessageAttachmentView({
  att,
  onMediaLoad,
  onRetried,
  onOpen,
  video = null,
  compact = false,
}: {
  att: AttachmentInfo;
  onMediaLoad?: () => void;
  /** Vừa bấm Thử lại thành công: khung chat hỏi lại kho sau một lúc */
  onRetried?: () => void;
  /** Mở cửa sổ xem ảnh / video (trong khung chat); không có thì ảnh mở ở thẻ mới như trước */
  onOpen?: () => void;
  /** Thông số video Zalo gửi kèm (thời lượng, tỉ lệ) */
  video?: ArchivedMessage["video"];
  /** Ô vuông nhỏ trong album: file chưa xem được hiện gọn (biểu tượng + chữ ngắn) */
  compact?: boolean;
}) {
  const url = att.status === "done" ? sameOriginUrl(att.url) : null;
  const name = att.fileName ?? KIND_LABEL[att.kind];

  if (!url) return <UnavailableAttachment att={att} name={name} onRetried={onRetried} compact={compact} />;

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
