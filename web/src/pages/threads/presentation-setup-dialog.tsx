import { useEffect, useMemo, useState } from "react";
import type { ThreadListItem, ZaloLabelsResponse } from "../../archive-api-types";
import { api } from "../../dashboard-api-client";
import { usePresentationMode } from "../../layout/presentation-mode-context";
import { useChotNen } from "../../shared/backdrop-close-guard";
import { IconClose, IconSearch } from "../../shared/dashboard-icons";
import { MAX_PRESENTATION_THREADS } from "../../shared/presentation-mode-state";
import { ForwardTargetList } from "./forward-target-list";
import { useForwardTargetList, type ForwardTab } from "./use-forward-target-list";

type SetupTab = ForwardTab | "chosen";
type Label = ZaloLabelsResponse["labels"][number];

/** Mở hộp chọn hội thoại trình chiếu khi bấm nút ở thanh bên (đặt một lần trong khung dashboard) */
export function PresentationSetupHost() {
  return usePresentationMode().setupOpen ? <PresentationSetupDialog /> : null;
}

/**
 * Hộp chọn hội thoại cho chế độ trình chiếu: tích từng hội thoại (tab Gần đây / Nhóm / Bạn bè, ô tìm - dùng chung danh sách
 * với hộp Chia sẻ), hoặc bấm một thẻ Phân loại của Zalo để tích cả thẻ (bấm lại để bỏ). Tab "Đã chọn" xem lại danh sách.
 * Mỗi lần mở là chọn từ đầu (thoát trình chiếu thì quên danh sách). Hộp này hiện mọi hội thoại nên phải chọn xong rồi mới
 * chia sẻ màn hình.
 */
function PresentationSetupDialog() {
  const p = usePresentationMode();
  const [tab, setTab] = useState<SetupTab>("recent");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>(p.threadIds);
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [error, setError] = useState(false);
  const list = useForwardTargetList(tab === "chosen" ? "recent" : tab, query, tab === "chosen" ? chosen : null);
  const nen = useChotNen(p.closeSetup);
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);

  useEffect(() => {
    api.zaloLabels().then((r) => setLabels(r.labels), () => setLabels([]));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.closeSetup();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.closeSetup]);

  const update = (next: (cur: string[]) => string[]) => {
    setChosen((cur) => next(cur).slice(0, MAX_PRESENTATION_THREADS));
    setError(false);
  };
  const toggle = (t: ThreadListItem) => update((cur) => (cur.includes(t.threadId) ? cur.filter((id) => id !== t.threadId) : [...cur, t.threadId]));
  const labelFull = (l: Label) => l.threadIds.length > 0 && l.threadIds.every((id) => chosenSet.has(id));
  const toggleLabel = (l: Label) =>
    update((cur) => (labelFull(l) ? cur.filter((id) => !l.threadIds.includes(id)) : [...new Set([...cur, ...l.threadIds])]));
  const tabs: Array<[SetupTab, string]> = [
    ["recent", "Gần đây"],
    ["group", "Nhóm trò chuyện"],
    ["friend", "Bạn bè"],
    ["chosen", `Đã chọn (${chosen.length})`],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-2 backdrop-blur-[2px] sm:p-4" {...nen} role="dialog" aria-modal="true" aria-label="Chế độ trình chiếu">
      <div className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center border-b border-line px-5 py-3">
          <h2 className="text-[17px] font-semibold text-ink">Chế độ trình chiếu</h2>
          <button type="button" onClick={p.closeSetup} aria-label="Đóng" className="ml-auto rounded-full p-1.5 text-ink-soft hover:bg-tile">
            <IconClose size={20} />
          </button>
        </div>

        <div className="space-y-3 px-5 pt-3">
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            Chọn sẵn các hội thoại sẽ dùng khi chia sẻ màn hình. Lúc trình chiếu, danh sách chỉ còn các hội thoại này; cần thêm thì gõ từ 3 chữ ở
            ô tìm. Hộp này hiện mọi hội thoại, nên chọn xong rồi mới bắt đầu chia sẻ màn hình.
          </p>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink">Chọn nhanh theo thẻ Phân loại trên Zalo</p>
            {labels && labels.length === 0 && (
              <p className="text-[12.5px] text-ink-soft">Chưa có thẻ Phân loại nào. Gắn thẻ cho hội thoại trên Zalo, kho tự lấy về mỗi giờ.</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {labels?.map((l) => {
                const on = labelFull(l);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLabel(l)}
                    disabled={l.threadIds.length === 0}
                    title={l.threadIds.length === 0 ? "Thẻ chưa có hội thoại nào trong kho" : on ? "Bỏ chọn các hội thoại của thẻ" : "Chọn mọi hội thoại của thẻ"}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] disabled:opacity-40 ${on ? "border-zalo-500 bg-zalo-50 text-zalo-600 dark:bg-zalo-500/15 dark:text-zalo-500" : "border-line text-ink hover:bg-tile"}`}
                  >
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color ?? "#9aa3af" }} />
                    {l.emoji && <span aria-hidden="true">{l.emoji}</span>}
                    {l.name}
                    <span className="text-ink-soft">{l.threadIds.length}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 focus-within:border-zalo-500">
            <IconSearch size={17} className="text-ink-soft" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm hội thoại..." className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-soft" />
          </label>
          <div role="tablist" className="flex gap-5 border-b border-line text-[14px]">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 py-2 ${tab === key ? "border-zalo-500 font-medium text-zalo-600 dark:text-zalo-500" : "border-transparent text-ink-soft hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-[200px] flex-1 overflow-hidden px-3 sm:h-[38dvh] sm:flex-none">
          <ForwardTargetList list={list} isChosen={(id) => chosenSet.has(id)} full={chosen.length >= MAX_PRESENTATION_THREADS} onToggle={toggle} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          <span className="mr-auto text-[13px] text-ink-soft">
            {error ? <span className="text-red-600 dark:text-red-400">Chọn ít nhất một hội thoại</span> : `Đã chọn ${chosen.length} hội thoại`}
            {chosen.length > 0 && (
              <button type="button" onClick={() => update(() => [])} className="ml-2 text-zalo-600 hover:underline dark:text-zalo-500">
                Bỏ chọn hết
              </button>
            )}
          </span>
          <button type="button" onClick={p.closeSetup} className="rounded-lg bg-tile px-5 py-2 text-[15px] font-medium text-ink hover:bg-line">
            Hủy
          </button>
          <button
            type="button"
            onClick={() => (chosen.length > 0 ? p.start(chosen) : setError(true))}
            className="rounded-lg bg-zalo-500 px-5 py-2 text-[15px] font-semibold text-white hover:bg-zalo-600"
          >
            Bắt đầu trình chiếu
          </button>
        </div>
      </div>
    </div>
  );
}
