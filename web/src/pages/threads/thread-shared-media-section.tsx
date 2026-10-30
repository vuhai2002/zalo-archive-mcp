import { useCallback, useEffect, useRef, useState } from "react";
import type { SharedAttachment } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { IconDownload, IconPlay } from "../../shared/action-and-media-icons";
import { mediaStatusLabel } from "../../shared/archive-status-labels";
import { IconChevronDown } from "../../shared/dashboard-icons";
import { formatDateTime } from "../../shared/format-archive-time";
import { FileTypeBadge } from "../../shared/file-type-badge";
import { formatFileSize } from "../../shared/format-file-size";
import { formatNumber } from "../../shared/ui-bits";
import { useLoadMoreWhenVisible } from "../../shared/use-load-more-when-visible";
import { canOpenInNewTab, sameOriginUrl } from "./message-attachment-view";

/** Xem gọn: 8 ảnh (2 hàng lưới) / 4 file; "Xem tất cả" thì tải từng trang 48 mục */
const PREVIEW = { visual: 8, file: 4 } as const;
const PAGE = 48;

/**
 * Một mục của bảng thông tin hội thoại như Zalo PC: "Ảnh/Video" (lưới ô vuông) hoặc "File" (danh
 * sách tên + dung lượng + ngày). Bấm tiêu đề để thu gọn / mở; mục chưa tải về hiện trạng thái.
 */
export function ThreadSharedMediaSection({ threadId, kind, timeZone }: { threadId: string; kind: "visual" | "file"; timeZone: string }) {
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const [items, setItems] = useState<SharedAttachment[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Chưa tải xong lần đầu thì chưa báo "chưa có" (tránh nháy chữ sai)
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(
    async (offset: number, limit: number) => {
      try {
        const r = await api.threadShared(threadId, { kind, limit, offset });
        setItems((cur) => (offset === 0 ? r.items : [...cur, ...r.items]));
        setTotal(r.total);
        setLoaded(true);
        setError(null);
      } catch (err) {
        setError(errorText(err));
      }
    },
    [threadId, kind],
  );

  useEffect(() => {
    void load(0, PREVIEW[kind]);
  }, [load, kind]);

  const moreRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  useLoadMoreWhenVisible({
    sentinel: moreRef,
    enabled: open && all && !error && items.length < total,
    busy,
    onLoadMore: () => {
      setBusy(true);
      void load(items.length, PAGE).finally(() => setBusy(false));
    },
  });

  const showAll = () => {
    setAll(true);
    void load(0, PAGE);
  };

  return (
    <section className="border-b-8 border-tile px-4 py-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between py-1 text-left">
        <span className="text-[15px] font-semibold text-ink">
          {kind === "visual" ? "Ảnh/Video" : "File"}
          {total > 0 && <span className="ml-1.5 text-[13px] font-medium text-ink-soft">({formatNumber(total)})</span>}
        </span>
        <IconChevronDown size={18} className={`text-ink-soft transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="mt-2">
          {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
          {!error && loaded && total === 0 && <p className="py-2 text-[13px] text-ink-soft">Chưa có {kind === "visual" ? "ảnh hay video" : "file"} nào trong kho.</p>}
          {kind === "visual" ? (
            <div className="grid grid-cols-4 gap-1">
              {items.map((a) => (
                <VisualTile key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map((a) => (
                <FileRow key={a.id} a={a} timeZone={timeZone} />
              ))}
            </ul>
          )}
          {items.length < total && !all && (
            <button type="button" onClick={showAll} className="mt-2.5 w-full rounded-md bg-tile py-2 text-[14px] font-semibold text-ink hover:bg-line">
              Xem tất cả
            </button>
          )}
          {/* Đã bấm Xem tất cả: cuộn tới cuối mục là tự tải trang tiếp */}
          <div ref={moreRef} aria-hidden="true" className="h-px" />
          {busy && <p className="py-1 text-center text-[12px] text-ink-soft">Đang tải...</p>}
        </div>
      )}
    </section>
  );
}

function VisualTile({ a }: { a: SharedAttachment }) {
  const url = a.status === "done" ? sameOriginUrl(a.url) : null;
  const tile = "relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-tile";
  if (!url) return <div className={`${tile} p-1 text-center text-[10.5px] leading-tight text-ink-soft`}>{mediaStatusLabel(a.status)}</div>;
  const body =
    a.kind === "video" ? (
      <span className={`${tile} bg-[#1c2433]`}>
        <video src={`${url}#t=0.5`} preload="metadata" muted className="h-full w-full object-cover opacity-80" />
        <span className="absolute flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white">
          <IconPlay size={16} />
        </span>
      </span>
    ) : (
      <img src={url} alt="Ảnh" loading="lazy" className="aspect-square w-full rounded-md object-cover" />
    );
  return canOpenInNewTab(a.mime) ? (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Mở cỡ gốc trong tab mới" className="block">
      {body}
    </a>
  ) : (
    body
  );
}

function FileRow({ a, timeZone }: { a: SharedAttachment; timeZone: string }) {
  const url = a.status === "done" ? sameOriginUrl(a.url) : null;
  const inner = (
    <>
      <FileTypeBadge name={a.fileName} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-ink">{a.fileName ?? "File"}</span>
        <span className="flex justify-between gap-2 text-[12px] text-ink-soft">
          <span>{url ? formatFileSize(a.sizeBytes) : mediaStatusLabel(a.status)}</span>
          <span>{formatDateTime(a.sentAt, timeZone)}</span>
        </span>
      </span>
      {url && <IconDownload size={16} className="shrink-0 text-ink-soft" />}
    </>
  );
  return (
    <li>
      {url ? (
        <a href={url} download={a.fileName ?? true} title="Tải file về máy" className="flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-tile">
          {inner}
        </a>
      ) : (
        <div className="flex items-center gap-3 px-1 py-1.5">{inner}</div>
      )}
    </li>
  );
}
