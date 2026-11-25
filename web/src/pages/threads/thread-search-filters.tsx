import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ThreadSender } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { IconClock } from "../../shared/action-and-media-icons";
import { ContactAvatar } from "../../shared/contact-avatar";
import { IconCheck, IconChevronDown, IconUsers } from "../../shared/dashboard-icons";
import { nhanKhopTuKhoa } from "../../shared/fold-for-search";
import { nowInZone } from "../../shared/format-archive-time";
import { customRange, DATE_PRESETS, presetRange, type DateRange } from "./search-date-presets";

export type SenderPick = { senderId: string; name: string };

/** Nút lọc kiểu Zalo ("Người gửi ▾") bung một khung nhỏ bên dưới; bấm ra ngoài hay Esc là đóng */
export function FilterDropdown({ icon, label, active, children }: { icon: ReactNode; label: string; active: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[13.5px] ${active ? "bg-zalo-50 text-zalo-500 dark:bg-zalo-500/15" : "bg-tile text-ink hover:bg-line"}`}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <IconChevronDown size={15} className="shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 min-w-[220px] rounded-lg border border-line bg-surface py-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export const OPTION = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] text-ink hover:bg-tile";

/** Lọc theo người gửi: danh sách người đã nhắn trong hội thoại (nhiều tin nhất trước), có ô tìm tên */
export function SenderFilter({ threadId, value, onChange }: { threadId: string; value: SenderPick | null; onChange: (v: SenderPick | null) => void }) {
  const [senders, setSenders] = useState<ThreadSender[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needle, setNeedle] = useState("");
  const load = () => {
    if (senders || error) return;
    api.threadSenders(threadId).then((r) => setSenders(r.senders), (err: unknown) => setError(errorText(err)));
  };
  const nameOf = (s: ThreadSender) => (s.isSelf ? `${s.name?.trim() || "Bạn"} (bạn)` : s.name?.trim() || s.senderId);
  const shown = (senders ?? []).filter((s) => nhanKhopTuKhoa(nameOf(s), needle));

  return (
    <div onMouseEnter={load} onFocus={load} className="min-w-0 flex-1">
      <FilterDropdown icon={<IconUsers size={15} className="shrink-0" />} label={value?.name ?? "Người gửi"} active={value !== null}>
        {(close) => (
          <div className="max-h-72 overflow-y-auto">
            {(senders?.length ?? 0) > 8 && (
              <input value={needle} onChange={(e) => setNeedle(e.target.value)} placeholder="Tìm tên" autoFocus className="gc-input mx-2 my-1 w-[calc(100%-16px)] py-1" />
            )}
            <button type="button" onClick={() => (onChange(null), close())} className={OPTION}>
              <span className="flex-1">Tất cả</span>
              {!value && <IconCheck size={15} className="text-zalo-500" />}
            </button>
            {error && <p className="px-3 py-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
            {!senders && !error && <p className="px-3 py-2 text-[13px] text-ink-soft">Đang tải...</p>}
            {shown.map((s) => (
              <button key={s.senderId} type="button" onClick={() => (onChange({ senderId: s.senderId, name: nameOf(s) }), close())} className={OPTION}>
                <ContactAvatar name={nameOf(s)} seed={s.senderId} url={s.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate">{nameOf(s)}</span>
                {value?.senderId === s.senderId && <IconCheck size={15} className="text-zalo-500" />}
              </button>
            ))}
          </div>
        )}
      </FilterDropdown>
    </div>
  );
}

/** Lọc theo ngày gửi: hôm nay / 7 ngày / 30 ngày qua, hoặc tự chọn khoảng ngày (theo giờ kho) */
export function DateFilter({ timeZone, value, onChange }: { timeZone: string; value: DateRange | null; onChange: (v: DateRange | null) => void }) {
  const today = nowInZone(timeZone).date;
  const [from, setFrom] = useState(value?.from ?? today);
  const [to, setTo] = useState(value?.to ?? today);
  return (
    <FilterDropdown icon={<IconClock size={15} className="shrink-0" />} label={value?.label ?? "Ngày gửi"} active={value !== null}>
      {(close) => (
        <div>
          <button type="button" onClick={() => (onChange(null), close())} className={OPTION}>
            <span className="flex-1">Tất cả</span>
            {!value && <IconCheck size={15} className="text-zalo-500" />}
          </button>
          {DATE_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => (onChange(presetRange(p.id, today)), close())} className={OPTION}>
              <span className="flex-1">{p.label}</span>
              {value?.label === p.label && <IconCheck size={15} className="text-zalo-500" />}
            </button>
          ))}
          <div className="border-t border-line px-3 pb-2 pt-2">
            <p className="mb-1.5 text-[12.5px] text-ink-soft">Chọn khoảng ngày</p>
            <div className="flex items-center gap-1.5">
              <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="gc-input min-w-0 flex-1 px-1.5 py-1 text-[13px]" />
              <span className="text-ink-soft">-</span>
              <input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="gc-input min-w-0 flex-1 px-1.5 py-1 text-[13px]" />
            </div>
            <button
              type="button"
              disabled={!from || !to}
              onClick={() => (onChange(customRange(from, to)), close())}
              className="mt-2 w-full rounded-md bg-zalo-500 py-1.5 text-[13.5px] font-semibold text-white hover:bg-zalo-600 disabled:opacity-50"
            >
              Áp dụng
            </button>
          </div>
        </div>
      )}
    </FilterDropdown>
  );
}
