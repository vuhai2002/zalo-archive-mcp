import { useCallback, useRef, useState } from "react";
import type { StorageThread } from "../../../archive-api-types";
import { api } from "../../../dashboard-api-client";
import { IconArrowLeft, IconCheck, IconSearch } from "../../../shared/dashboard-icons";
import { formatFileSize } from "../../../shared/format-file-size";
import { ThreadAvatar } from "../../../shared/thread-avatar";
import { threadDisplayName } from "../../../shared/thread-kind-badge";
import { useDebouncedValue } from "../../../shared/use-debounced-value";
import { useLoadMoreWhenVisible } from "../../../shared/use-load-more-when-visible";
import { ErrorNote } from "../../../shared/ui-bits";
import { useSettingsView } from "../settings-view-context";
import { useRemoveStoredFiles } from "./use-remove-stored-files";
import { useStoragePagedList } from "./use-storage-paged-list";

const SORTS: Array<[string, string]> = [
  ["size", "Lớn nhất"],
  ["newest", "Mới nhất"],
  ["oldest", "Cũ nhất"],
];

/**
 * Hội thoại xếp theo dung lượng file như "Tin nhắn media" của Zalo PC: tìm theo tên, sắp xếp, tick chọn rồi "Xóa dữ liệu" (xóa
 * file của cả hội thoại, tin nhắn vẫn giữ). Bấm vào tên hội thoại để xem lưới file của nó như Zalo điện thoại.
 */
export function StorageThreadListSection() {
  const { go } = useSettingsView();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("size");
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const q = useDebouncedValue(query.trim(), 250);
  const fetchPage = useCallback((offset: number) => api.storageThreads({ sort, query: q || undefined, limit: 50, offset }), [sort, q]);
  const list = useStoragePagedList<StorageThread, Awaited<ReturnType<typeof fetchPage>>>(fetchPage);
  const removal = useRemoveStoredFiles(() => {
    setSelected(new Map());
    list.reload();
  });
  const scroll = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  useLoadMoreWhenVisible({ sentinel, root: scroll, enabled: list.hasMore && !list.error, busy: list.loading, onLoadMore: list.loadMore });

  const toggle = (t: StorageThread) =>
    setSelected((cur) => {
      const next = new Map(cur);
      if (next.has(t.threadId)) next.delete(t.threadId);
      else next.set(t.threadId, t.bytes);
      return next;
    });
  const allChosen = list.items.length > 0 && list.items.every((t) => selected.has(t.threadId));
  const selectAll = () => setSelected(allChosen ? new Map() : new Map(list.items.map((t) => [t.threadId, t.bytes])));
  const selectedBytes = [...selected.values()].reduce((s, n) => s + n, 0);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => go({ section: "data" })} aria-label="Quay lại Quản lý dữ liệu" className="rounded-full p-1.5 text-ink-soft hover:bg-tile">
          <IconArrowLeft size={20} />
        </button>
        <h2 className="text-[18px] font-semibold text-ink">Ảnh, video, file theo hội thoại</h2>
      </div>
      <p className="mt-1 text-[13.5px] text-ink-soft">
        Dọn ảnh, video, file hoặc tin nhắn thoại của hội thoại để giải phóng dung lượng trên máy. Tin nhắn của các hội thoại này không bị xóa.
      </p>

      <div className="mt-3 flex gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 focus-within:border-zalo-500">
          <IconSearch size={17} className="text-ink-soft" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nhập tên hội thoại" className="w-full bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-soft" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sắp xếp" className="rounded-lg border border-line bg-surface px-3 text-[14px] text-ink">
          {SORTS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <button type="button" onClick={selectAll} className="mt-3 flex items-center gap-2 self-start text-[14px] text-ink">
        <Check on={allChosen} /> Chọn tất cả
      </button>

      {/* Lấp hết chiều cao còn lại của cửa sổ Cài đặt (thanh Xóa dữ liệu sát đáy), màn thấp thì tối thiểu 240px */}
      <div ref={scroll} className="mt-2 min-h-[240px] flex-1 overflow-y-auto rounded-xl bg-surface shadow-sm">
        {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
        {list.items.map((t) => (
          <div key={t.threadId} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-tile/60">
            <button type="button" role="checkbox" aria-checked={selected.has(t.threadId)} aria-label={`Chọn ${threadDisplayName(t.name)}`} onClick={() => toggle(t)} className="p-1">
              <Check on={selected.has(t.threadId)} />
            </button>
            <button
              type="button"
              onClick={() => go({ section: "data", page: "files", thread: t.threadId, threadName: t.name })}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              title="Xem các file của hội thoại này"
            >
              <ThreadAvatar t={t} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-ink">{threadDisplayName(t.name)}</span>
                <span className="text-[13px] text-ink-soft">
                  {formatFileSize(t.bytes)} - {t.files.toLocaleString("vi-VN")} file
                </span>
              </span>
            </button>
          </div>
        ))}
        <div ref={sentinel} aria-hidden="true" className="h-px" />
        {list.loading && <p className="py-3 text-center text-[13px] text-ink-soft">Đang tải...</p>}
        {!list.loading && !list.error && list.items.length === 0 && <p className="py-8 text-center text-[14px] text-ink-soft">Không có hội thoại nào có file.</p>}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[14px] text-ink">
          <b className="tabular-nums">{selected.size}</b> đã chọn ({formatFileSize(selectedBytes)})
        </span>
        <button type="button" onClick={() => setSelected(new Map())} disabled={selected.size === 0} className="ml-auto rounded-lg bg-tile px-4 py-2 text-[14px] font-medium text-ink hover:bg-line disabled:opacity-40">
          Hủy
        </button>
        <button
          type="button"
          onClick={() => void removal.remove({ threadIds: [...selected.keys()] })}
          disabled={selected.size === 0 || removal.busy}
          className="rounded-lg bg-red-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-red-700 disabled:opacity-40"
        >
          Xóa dữ liệu
        </button>
      </div>
      {removal.overlay}
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded border-2 ${on ? "border-zalo-500 bg-zalo-500 text-white" : "border-line bg-surface"}`}>
      {on && <IconCheck size={12} strokeWidth={3} />}
    </span>
  );
}
