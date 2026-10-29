import { useEffect, useState, type FormEvent } from "react";
import type { ThreadSummary } from "../../archive-api-types";
import { IconSearch } from "../../shared/dashboard-icons";
import { SelectMenu, type SelectOption } from "../../shared/select-menu";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { BTN_PRIMARY } from "../../shared/ui-bits";

export type SearchFilters = { q: string; threadId: string; fromDate: string; toDate: string };

/**
 * Form lọc tìm kiếm. Giữ bản nháp riêng, chỉ đẩy lên khi bấm Tìm: mỗi lần đẩy
 * là một lần đổi URL + một request, gõ từng phím mà đẩy thì lịch sử trình duyệt
 * đầy rác và server bị hỏi dồn.
 */
export function SearchFilterForm({
  value,
  threads,
  onSubmit,
}: {
  value: SearchFilters;
  threads: ThreadSummary[];
  onSubmit: (f: SearchFilters) => void;
}) {
  const [draft, setDraft] = useState(value);
  // URL đổi từ ngoài (bấm link "Tìm trong hội thoại này", nút Back) thì form theo
  useEffect(() => setDraft(value), [value]);

  const set = (patch: Partial<SearchFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const dateError = draft.fromDate && draft.toDate && draft.fromDate > draft.toDate ? "Ngày bắt đầu sau ngày kết thúc." : null;

  const options: SelectOption[] = [
    { value: "", label: "Tất cả hội thoại" },
    ...threads.map((t) => ({ value: t.threadId, label: threadDisplayName(t.name), hint: t.threadType === "group" ? "nhóm" : undefined })),
  ];
  // Hội thoại đến từ URL mà không nằm trong danh sách đã tải: vẫn phải chọn được
  if (draft.threadId && !threads.some((t) => t.threadId === draft.threadId)) {
    options.push({ value: draft.threadId, label: draft.threadId, hint: "theo mã" });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.q.trim() || dateError) return;
    onSubmit({ ...draft, q: draft.q.trim() });
  }

  return (
    <form onSubmit={submit} className="gc-card space-y-3 p-4">
      <div className="relative">
        <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/60" />
        <input
          value={draft.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Từ khóa (không cần gõ dấu)..."
          aria-label="Từ khóa tìm kiếm"
          autoFocus
          className="gc-input w-full pl-9"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div className="min-w-0">
          <label htmlFor="search-thread-filter" className="text-[12px] text-ink-soft">
            Hội thoại
          </label>
          <div className="mt-1">
            <SelectMenu
              id="search-thread-filter"
              value={draft.threadId}
              options={options}
              onChange={(v) => set({ threadId: v })}
              size="md"
            />
          </div>
        </div>
        <label className="text-[12px] text-ink-soft">
          Từ ngày
          <input type="date" value={draft.fromDate} onChange={(e) => set({ fromDate: e.target.value })} className="gc-input mt-1 block w-full" />
        </label>
        <label className="text-[12px] text-ink-soft">
          Đến ngày
          <input type="date" value={draft.toDate} onChange={(e) => set({ toDate: e.target.value })} className="gc-input mt-1 block w-full" />
        </label>
      </div>
      {dateError && <p className="text-[12px] text-red-600 dark:text-red-400">{dateError}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={!draft.q.trim() || dateError !== null} className={BTN_PRIMARY}>
          <IconSearch size={16} /> Tìm
        </button>
      </div>
    </form>
  );
}
