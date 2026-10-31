import type { ArchivedMessage } from "../../archive-api-types";
import { canOpenInNewTab, MessageAttachmentView, sameOriginUrl } from "./message-attachment-view";
import { useMediaViewer } from "./media-viewer-context";
import { viewerItemFromMessage } from "./media-viewer-items";
import { albumColumns } from "./photo-album-grouping";

/**
 * Album ảnh (nhiều ảnh gửi cùng lúc) như Zalo: khung lưới ô vuông, ảnh cắt vừa ô, bấm mở cửa sổ xem
 * ảnh của hội thoại. Ảnh chưa tải được (đang chờ, hỏng, link hết hạn) hiện trạng thái + nút Thử lại ngay trong ô.
 */
export function MessageAlbumGrid({
  album,
  onMediaLoad,
  onMediaRetried,
}: {
  album: ArchivedMessage[];
  onMediaLoad: () => void;
  onMediaRetried: () => void;
}) {
  const viewer = useMediaViewer();
  return (
    <div className={`grid w-[min(360px,100%)] gap-1 ${albumColumns(album.length) === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {album.map((m) => {
        const att = m.attachments.find((a) => a.kind === "photo") ?? m.attachments[0];
        const url = att?.status === "done" ? sameOriginUrl(att.url) : null;
        const dim = m.recalledAt !== null ? "opacity-60" : "";
        if (!att || !url) {
          return (
            <div key={m.id} className={`flex aspect-square items-center justify-center overflow-hidden rounded-md bg-black/[0.04] p-1 dark:bg-white/5 ${dim}`}>
              {att ? <MessageAttachmentView att={att} onMediaLoad={onMediaLoad} onRetried={onMediaRetried} compact /> : null}
            </div>
          );
        }
        const img = (
          <img
            src={url}
            alt={att.fileName ?? "Ảnh"}
            loading="lazy"
            onLoad={onMediaLoad}
            className={`aspect-square w-full rounded-md border border-black/10 bg-bubble object-cover dark:border-white/10 ${dim}`}
          />
        );
        const item = viewer ? viewerItemFromMessage(m, att) : null;
        if (item) {
          return (
            <button key={m.id} type="button" onClick={() => viewer?.open(item)} title="Xem ảnh" className="block cursor-zoom-in">
              {img}
            </button>
          );
        }
        return canOpenInNewTab(att.mime) ? (
          <a key={m.id} href={url} target="_blank" rel="noopener noreferrer" title="Mở ảnh cỡ gốc trong tab mới" className="block cursor-zoom-in">
            {img}
          </a>
        ) : (
          <div key={m.id}>{img}</div>
        );
      })}
    </div>
  );
}
