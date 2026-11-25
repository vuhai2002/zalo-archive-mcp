import { useEffect, useState } from "react";
import type { ThreadSender } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { ContactAvatar } from "../../shared/contact-avatar";
import { IconCheck, IconUsers } from "../../shared/dashboard-icons";
import { useDebouncedValue } from "../../shared/use-debounced-value";
import { FilterDropdown, OPTION, type SenderPick } from "./thread-search-filters";

/**
 * Lọc người gửi cho ô tìm chung (mọi hội thoại), như Zalo PC: "Bạn" ở đầu, gõ tên để tìm người khác trong cả kho (không
 * dấu, theo tên gợi nhớ / tên Zalo), nhiều tin trước. Khác bộ lọc trong một hội thoại (tải sẵn người đã nhắn ở đó).
 */
export function GlobalSenderFilter({ value, onChange }: { value: SenderPick | null; onChange: (v: SenderPick | null) => void }) {
  const [needle, setNeedle] = useState("");
  const q = useDebouncedValue(needle.trim(), 250);
  const [senders, setSenders] = useState<ThreadSender[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!opened) return;
    let stale = false;
    setError(null);
    api.globalSenders(q).then(
      (r) => !stale && setSenders(r.senders),
      (err: unknown) => !stale && setError(errorText(err)),
    );
    return () => {
      stale = true;
    };
  }, [q, opened]);

  const nameOf = (s: ThreadSender) => (s.isSelf ? "Bạn" : s.name?.trim() || s.senderId);
  return (
    <div onMouseEnter={() => setOpened(true)} onFocus={() => setOpened(true)} className="min-w-0 flex-1">
      <FilterDropdown icon={<IconUsers size={15} className="shrink-0" />} label={value?.name ?? "Người gửi"} active={value !== null}>
        {(close) => (
          <div className="max-h-80 overflow-y-auto">
            <input value={needle} onChange={(e) => setNeedle(e.target.value)} placeholder="Tìm tên người gửi" autoFocus className="gc-input mx-2 my-1 w-[calc(100%-16px)] py-1" />
            <button type="button" onClick={() => (onChange(null), close())} className={OPTION}>
              <span className="flex-1">Tất cả</span>
              {!value && <IconCheck size={15} className="text-zalo-500" />}
            </button>
            {error && <p className="px-3 py-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
            {!senders && !error && <p className="px-3 py-2 text-[13px] text-ink-soft">Đang tải...</p>}
            {senders?.map((s) => (
              <button key={s.senderId} type="button" onClick={() => (onChange({ senderId: s.senderId, name: nameOf(s) }), close())} className={OPTION}>
                <ContactAvatar name={nameOf(s)} seed={s.senderId} url={s.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate">{nameOf(s)}</span>
                <span className="text-[12px] text-ink-soft">{s.count} tin</span>
                {value?.senderId === s.senderId && <IconCheck size={15} className="text-zalo-500" />}
              </button>
            ))}
            {senders && !q && <p className="px-3 py-2 text-[12px] text-ink-soft">Gõ tên để tìm người khác</p>}
            {senders && q && senders.every((s) => s.isSelf) && <p className="px-3 py-2 text-[12px] text-ink-soft">Không thấy ai tên "{q}"</p>}
          </div>
        )}
      </FilterDropdown>
    </div>
  );
}
