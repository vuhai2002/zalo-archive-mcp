import { useCallback, useRef, useState } from "react";
import type { StorageFile, StorageTab } from "../../../archive-api-types";
import { api } from "../../../dashboard-api-client";
import { IconArrowLeft } from "../../../shared/dashboard-icons";
import { formatFileSize } from "../../../shared/format-file-size";
import { sameOriginUrl } from "../../../shared/same-origin-media-url";
import { threadDisplayName } from "../../../shared/thread-kind-badge";
import { useLoadMoreWhenVisible } from "../../../shared/use-load-more-when-visible";
import { ErrorNote } from "../../../shared/ui-bits";
import { downloadUrlOf, TAB_LABELS } from "./storage-display-rules";
import { StorageFileTile } from "./storage-file-tile";
import { StorageFileViewer } from "./storage-file-viewer";
import { useSettingsView } from "../settings-view-context";
import { useRemoveStoredFiles } from "./use-remove-stored-files";
import { useStoragePagedList } from "./use-storage-paged-list";

/**
 * Lưới file như Zalo điện thoại: của một hội thoại hoặc file lớn hơn 5 MB của cả kho (theo màn đang mở trong cửa sổ Cài đặt), tab Tất cả / Ảnh /
 * Video / File / Tin nhắn thoại, lớn nhất trước. Bấm vào ô để xem nhanh (lướt file trước / sau, chọn ngay trong cửa sổ xem), bấm vòng
 * tròn để chọn; chọn rồi Mở, Xem tin gốc, Lưu về máy, hoặc Xóa (xóa FILE, tin vẫn giữ).
 */
export function StorageFileGridSection() {
  const { view, go, openInMain } = useSettingsView();
  const thread = view.thread;
  const big = view.big === true;
  // Tên hội thoại truyền từ danh sách (hiện ngay, trước khi lưới tải xong)
  const passedName = view.threadName ?? null;
  const [tab, setTab] = useState<StorageTab>("all");
  const [sort, setSort] = useState<"size" | "newest">("size");
  const [selected, setSelected] = useState<Map<number, StorageFile>>(new Map());
  // Vị trí file đang xem nhanh trong danh sách đã tải (null = đóng)
  const [viewing, setViewing] = useState<number | null>(null);
  const fetchPage = useCallback(
    (offset: number) => api.storageFiles({ thread, tab, big: big ? "1" : undefined, sort, limit: 60, offset }),
    [thread, tab, big, sort],
  );
  const list = useStoragePagedList<StorageFile, Awaited<ReturnType<typeof fetchPage>>>(fetchPage);
  const removal = useRemoveStoredFiles(() => {
    setSelected(new Map());
    list.reload();
  });
  const scroll = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  useLoadMoreWhenVisible({ sentinel, root: scroll, enabled: list.hasMore && !list.error, busy: list.loading, onLoadMore: list.loadMore });

  const title = big ? "Ảnh, video, file lớn hơn 5 MB" : threadDisplayName(passedName ?? list.items[0]?.threadName ?? null);
  const toggle = (f: StorageFile) =>
    setSelected((cur) => {
      const next = new Map(cur);
      if (next.has(f.id)) next.delete(f.id);
      else next.set(f.id, f);
      return next;
    });
  const one = selected.size === 1 ? [...selected.values()][0]! : null;
  const selectedBytes = [...selected.values()].reduce((s, f) => s + f.sizeBytes, 0);
  const open = (f: StorageFile) => {
    const i = list.items.findIndex((x) => x.id === f.id);
    if (i >= 0) setViewing(i);
  };
  const openOriginal = (f: StorageFile) => openInMain(`/threads/${encodeURIComponent(f.threadId)}?msg=${f.messageId}`);

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      {/* lg:pr-12: chừa chỗ cho nút X ở góc cửa sổ Cài đặt */}
      <div className="flex items-center gap-2 lg:pr-12">
        <button type="button" onClick={() => go(big ? { section: "data" } : { section: "data", page: "threads" })} aria-label="Quay lại" className="rounded-full p-1.5 text-ink-soft hover:bg-tile">
          <IconArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-semibold text-ink">{title}</h2>
          <p className="text-[13px] text-ink-soft">
            Đã chọn: {selected.size} mục{selected.size > 0 ? ` (${formatFileSize(selectedBytes)})` : ""}
            {list.last ? ` - tổng ${list.last.total.toLocaleString("vi-VN")} file, ${formatFileSize(list.last.totalBytes)}` : ""}
          </p>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as "size" | "newest")} aria-label="Sắp xếp" className="ml-auto rounded-lg border border-line bg-surface px-2 py-1.5 text-[13.5px] text-ink">
          <option value="size">Lớn nhất</option>
          <option value="newest">Mới nhất</option>
        </select>
      </div>

      <div role="tablist" className="mt-3 flex gap-5 overflow-x-auto border-b border-line text-[14.5px]">
        {TAB_LABELS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => (setTab(key), setSelected(new Map()))}
            className={`-mb-px shrink-0 border-b-2 py-2 ${tab === key ? "border-ink font-semibold text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lấp hết chiều cao còn lại của cửa sổ Cài đặt (thanh nút sát đáy), màn thấp thì tối thiểu 260px */}
      <div ref={scroll} className="mt-2 min-h-[260px] flex-1 overflow-y-auto">
        {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
          {list.items.map((f) => (
            <StorageFileTile key={f.id} file={f} selected={selected.has(f.id)} onToggle={() => toggle(f)} onOpen={() => open(f)} />
          ))}
        </div>
        <div ref={sentinel} aria-hidden="true" className="h-px" />
        {list.loading && <p className="py-3 text-center text-[13px] text-ink-soft">Đang tải...</p>}
        {!list.loading && !list.error && list.items.length === 0 && <p className="py-8 text-center text-[14px] text-ink-soft">Không có file nào ở mục này.</p>}
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-surface p-1.5 shadow-sm">
        <ActionButton label="Mở" disabled={!one} onClick={() => one && open(one)} />
        <ActionButton label="Xem tin gốc" disabled={!one} onClick={() => one && openOriginal(one)} />
        {one ? (
          <a href={downloadUrlOf(sameOriginUrl(one.url) ?? one.url)} download={one.fileName ?? true} className="rounded-lg py-2 text-center text-[14px] font-medium text-ink hover:bg-tile">
            Lưu về máy
          </a>
        ) : (
          <ActionButton label="Lưu về máy" disabled onClick={() => undefined} />
        )}
        <button
          type="button"
          onClick={() => void removal.remove({ attachmentIds: [...selected.keys()] })}
          disabled={selected.size === 0 || removal.busy}
          className="rounded-lg py-2 text-[14px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40"
        >
          Xóa{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>
      {viewing !== null && (
        <StorageFileViewer
          files={list.items}
          index={viewing}
          total={list.last?.total ?? list.items.length}
          hasMore={list.hasMore}
          isSelected={(f) => selected.has(f.id)}
          onIndex={setViewing}
          onLoadMore={list.loadMore}
          onToggle={toggle}
          onOpenOriginal={openOriginal}
          onClose={() => setViewing(null)}
        />
      )}
      {removal.overlay}
    </div>
  );
}

function ActionButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rounded-lg py-2 text-[14px] font-medium text-ink hover:bg-tile disabled:opacity-40 disabled:hover:bg-transparent">
      {label}
    </button>
  );
}
