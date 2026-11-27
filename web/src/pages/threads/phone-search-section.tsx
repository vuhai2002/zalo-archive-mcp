import { useEffect, useState } from "react";
import type { PhoneSearchResult } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { ContactAvatar } from "../../shared/contact-avatar";
import { useDebouncedValue } from "../../shared/use-debounced-value";
import { phoneInQuery } from "./phone-in-search-query";
import type { RecentThread } from "./recent-search-threads";

const pretty = (p: string) => `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}`;

/**
 * Gõ số điện thoại vào ô Tìm kiếm thì hiện người dùng Zalo của số đó, như Zalo PC: số kho đã tra thì có ngay, chưa thì daemon
 * hỏi Zalo một lần (chờ gõ xong nửa giây mới hỏi). Bấm vào người là mở hội thoại để nhắn, kể cả khi chưa kết bạn.
 */
export function PhoneSearchSection({ query, onOpenThread }: { query: string; onOpenThread: (t: RecentThread) => void }) {
  const phone = useDebouncedValue(phoneInQuery(query), 500);
  const [result, setResult] = useState<{ phone: string; r: PhoneSearchResult } | null>(null);

  useEffect(() => {
    if (!phone) return;
    let stale = false;
    api.phoneSearch(phone).then(
      (r) => !stale && setResult({ phone, r }),
      (err: unknown) => !stale && setResult({ phone, r: { status: "error", message: errorText(err) } }),
    );
    return () => {
      stale = true;
    };
  }, [phone]);

  if (!phoneInQuery(query)) return null;
  const r = result && result.phone === phone ? result.r : null;
  return (
    <section className="border-b border-line">
      <h4 className="px-4 pb-1 pt-3 text-[14.5px] font-semibold text-ink">Tìm qua số điện thoại</h4>
      {!r && <p className="px-4 pb-3 text-[13px] text-ink-soft">Đang tìm số {pretty(phoneInQuery(query)!)} trên Zalo...</p>}
      {r?.status === "found" && (
        <ul>
          <li>
            <button
              type="button"
              onClick={() => onOpenThread({ threadId: r.user.uid, threadType: "user", name: r.user.name, avatarUrl: r.user.avatarUrl })}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-tile"
            >
              <ContactAvatar name={r.user.name ?? pretty(result!.phone)} seed={r.user.uid} url={r.user.avatarUrl} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-ink">{r.user.name ?? "Người dùng Zalo"}</span>
                <span className="block text-[12.5px] text-ink-soft">
                  {pretty(result!.phone)} · {r.user.isFriend ? "Bạn bè" : "Chưa kết bạn"}
                </span>
              </span>
              <span className="shrink-0 rounded-md bg-zalo-50 px-2.5 py-1 text-[13px] font-medium text-zalo-600 dark:bg-zalo-500/15 dark:text-zalo-200">
                Nhắn tin
              </span>
            </button>
          </li>
        </ul>
      )}
      {r?.status === "no_zalo" && <p className="px-4 pb-3 text-[13px] text-ink-soft">Số {pretty(result!.phone)} chưa có Zalo hoặc không cho tìm bằng số điện thoại.</p>}
      {(r?.status === "unavailable" || r?.status === "error") && <p className="px-4 pb-3 text-[13px] text-red-600 dark:text-red-400">{r.message}</p>}
    </section>
  );
}
