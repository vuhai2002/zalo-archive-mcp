import { useEffect, useState } from "react";
import type { ArchivedMessage, ThreadListItem } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { useChotNen } from "../../shared/backdrop-close-guard";
import { IconClose, IconSearch, IconWarning } from "../../shared/dashboard-icons";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { ForwardTargetList } from "./forward-target-list";
import { useForwardTargetList, type ForwardTab } from "./use-forward-target-list";

/** Khớp MAX_FORWARD_TARGETS phía server (src/outbox/enqueue-forward-request.ts) */
const MAX_TARGETS = 100;
const TABS: Array<[ForwardTab, string]> = [
  ["recent", "Gần đây"],
  ["group", "Nhóm trò chuyện"],
  ["friend", "Bạn bè"],
];

/**
 * Hộp "Chia sẻ" như Zalo: tìm + chọn tối đa 100 hội thoại (tab Gần đây / Nhóm trò chuyện / Bạn bè), xem lại tin sẽ chia
 * sẻ, kèm lời nhắn tùy chọn. Bấm Chia sẻ chỉ GHI vào hàng đợi: mỗi nơi một tin, daemon gửi lần lượt vài giây một tin.
 */
export function ForwardShareDialog({ message, onClose, onDone }: { message: ArchivedMessage; onClose: () => void; onDone: (notice: string) => void }) {
  const { killSwitch } = useDashboardShell();
  const [tab, setTab] = useState<ForwardTab>("recent");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Map<string, ThreadListItem>>(new Map());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useForwardTargetList(tab, query);
  const nen = useChotNen(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (t: ThreadListItem) =>
    setChosen((cur) => {
      const next = new Map(cur);
      if (next.has(t.threadId)) next.delete(t.threadId);
      else if (next.size < MAX_TARGETS) next.set(t.threadId, t);
      return next;
    });

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.messageForward(message.id, { threadIds: [...chosen.keys()], note: note.trim() || undefined });
      onDone(`Đã xếp chia sẻ tới ${chosen.size} hội thoại (${r.ids.length} tin) vào hàng đợi, daemon gửi lần lượt.`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-2 backdrop-blur-[2px] sm:p-4" {...nen} role="dialog" aria-modal="true" aria-label="Chia sẻ">
      <div className="flex max-h-[92dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center border-b border-line px-5 py-3">
          <h2 className="text-[17px] font-semibold text-ink">Chia sẻ</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="ml-auto rounded-full p-1.5 text-ink-soft hover:bg-tile">
            <IconClose size={20} />
          </button>
        </div>

        <div className="px-5 pt-3">
          <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 focus-within:border-zalo-500">
            <IconSearch size={17} className="text-ink-soft" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm kiếm..." className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-soft" />
          </label>
          <div role="tablist" className="mt-2 flex gap-5 border-b border-line text-[14px]">
            {TABS.map(([key, label]) => (
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

        <div className="flex min-h-[220px] flex-1 overflow-hidden px-3 sm:h-[46dvh] sm:flex-none">
          <ForwardTargetList list={list} isChosen={(id) => chosen.has(id)} full={chosen.size >= MAX_TARGETS} onToggle={toggle} />
          <div className="hidden w-60 shrink-0 flex-col border-l border-line pl-3 pt-2 sm:flex">
            <div className="flex items-center text-[14px]">
              <b className="text-ink">
                Đã chọn: {chosen.size}/{MAX_TARGETS}
              </b>
              {chosen.size > 0 && (
                <button type="button" onClick={() => setChosen(new Map())} className="ml-auto text-zalo-600 hover:underline dark:text-zalo-500">
                  Xóa
                </button>
              )}
            </div>
            <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {[...chosen.values()].map((t) => (
                <li key={t.threadId} className="flex items-center gap-2 rounded-md px-1 py-1 text-[14px] text-ink">
                  <span className="min-w-0 flex-1 truncate">{threadDisplayName(t.name)}</span>
                  <button type="button" onClick={() => toggle(t)} aria-label={`Bỏ ${threadDisplayName(t.name)}`} className="rounded p-0.5 text-ink-soft hover:bg-tile hover:text-ink">
                    <IconClose size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-2 border-t border-line px-5 py-3">
          <div className="rounded-lg bg-tile px-3 py-2">
            <div className="text-[13px] font-semibold text-ink">Chia sẻ tin nhắn</div>
            <p className="mt-0.5 max-h-[4.5em] overflow-y-auto whitespace-pre-wrap text-[14px] leading-snug text-ink [overflow-wrap:anywhere]">{message.link?.text ?? message.text}</p>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="Nhập tin nhắn..."
            aria-label="Lời nhắn gửi kèm"
            className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-[15px] text-ink outline-none placeholder:text-ink-soft focus:border-zalo-500"
          />
          {killSwitch?.killed && (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-red-600 dark:text-red-400">
              <IconWarning size={14} /> Khóa khẩn cấp đang bật: tin sẽ nằm trong hàng đợi, không được gửi đi.
            </p>
          )}
          {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <span className="mr-auto text-[13px] text-ink-soft sm:hidden">
            Đã chọn {chosen.size}/{MAX_TARGETS}
          </span>
          <button type="button" onClick={onClose} className="rounded-lg bg-tile px-5 py-2 text-[15px] font-medium text-ink hover:bg-line">
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void share()}
            disabled={chosen.size === 0 || busy}
            className="rounded-lg bg-zalo-500 px-5 py-2 text-[15px] font-semibold text-white hover:bg-zalo-600 disabled:opacity-40 disabled:hover:bg-zalo-500"
          >
            {busy ? "Đang xếp..." : "Chia sẻ"}
          </button>
        </div>
      </div>
    </div>
  );
}
