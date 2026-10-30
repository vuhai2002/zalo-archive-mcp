import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { SharedLink, ThreadMember } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { IconLink } from "../../shared/action-and-media-icons";
import { ContactAvatar } from "../../shared/contact-avatar";
import { IconChevronDown, IconUsers } from "../../shared/dashboard-icons";
import { formatNumber } from "../../shared/ui-bits";
import { zaloListTime } from "../../shared/zalo-list-time-and-preview";

/** Một trang danh sách của bảng thông tin: xem gọn `preview` mục, "Xem tất cả" thì tải tiếp từng trang */
function usePagedPanelList<T>(fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; total: number }>, preview: number, page: number) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Trang về thiếu: hết thật (số Zalo báo có thể lớn hơn số kho biết, vd thành viên nhóm)
  const [exhausted, setExhausted] = useState(false);
  // Chưa tải xong lần đầu thì chưa nói "0" hay "chưa có" (tránh nháy chữ sai)
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(
    (offset: number, limit: number) => {
      setBusy(true);
      fetchPage(offset, limit)
        .then((r) => {
          setItems((cur) => (offset === 0 ? r.items : [...cur, ...r.items]));
          setTotal(r.total);
          setExhausted(r.items.length < limit);
          setLoaded(true);
          setError(null);
        }, (err: unknown) => setError(errorText(err)))
        .finally(() => setBusy(false));
    },
    [fetchPage],
  );
  useEffect(() => load(0, preview), [load, preview]);
  return { items, total, error, busy, loaded, hasMore: !exhausted && items.length < total, more: () => load(items.length, page) };
}

/** Khung một mục: tiêu đề bấm để thu gọn / mở như Zalo PC, kèm số mục */
function InfoSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b-8 border-tile px-4 py-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between py-1 text-left">
        <span className="text-[15px] font-semibold text-ink">
          {title}
          {count > 0 && <span className="ml-1.5 text-[13px] font-medium text-ink-soft">({formatNumber(count)})</span>}
        </span>
        <IconChevronDown size={18} className={`text-ink-soft transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}

const MoreButton = ({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) => (
  <button type="button" onClick={onClick} disabled={busy} className="mt-2.5 w-full rounded-md bg-tile py-2 text-[14px] font-semibold text-ink hover:bg-line disabled:opacity-60">
    {busy ? "Đang tải..." : label}
  </button>
);

/** Mục "Link" như Zalo PC: các link đã gửi trong hội thoại (mở ở thẻ mới), tên miền, ngày gửi */
export function ThreadLinksSection({ threadId, timeZone }: { threadId: string; timeZone: string }) {
  const fetchPage = useCallback((offset: number, limit: number) => api.threadLinks(threadId, { offset, limit }), [threadId]);
  const list = usePagedPanelList<SharedLink>(fetchPage, 3, 20);
  return (
    <InfoSection title="Link" count={list.total}>
      {list.error && <p className="text-[12px] text-red-600 dark:text-red-400">{list.error}</p>}
      {!list.error && list.loaded && list.total === 0 && <p className="py-2 text-[13px] text-ink-soft">Chưa có link nào trong kho.</p>}
      <ul className="space-y-1">
        {list.items.map((l) => (
          <li key={`${l.messageId}-${l.url}`}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-tile" title={l.url}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-tile text-ink-soft">
                <IconLink size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink">{l.title || l.url}</span>
                <span className="flex justify-between gap-2 text-[12px]">
                  <span className="truncate text-zalo-500">{l.domain}</span>
                  <span className="shrink-0 text-ink-soft">{zaloListTime(l.sentAt, timeZone)}</span>
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {list.hasMore && <MoreButton label={list.items.length <= 3 ? "Xem tất cả" : "Xem thêm"} onClick={list.more} busy={list.busy} />}
    </InfoSection>
  );
}

/**
 * Mục "Thành viên" của nhóm: số thành viên rồi danh sách (ai đã biết tên đứng trước). Nhóm đông thì kho
 * chỉ hỏi hồ sơ người đã nhắn tin, nên người chưa từng nhắn hiện "Chưa rõ tên".
 */
export function ThreadMembersSection({ threadId }: { threadId: string }) {
  const fetchPage = useCallback(
    (offset: number, limit: number) => api.threadMembers(threadId, { offset, limit }).then((r) => ({ items: r.members, total: r.total })),
    [threadId],
  );
  const list = usePagedPanelList<ThreadMember>(fetchPage, 5, 30);
  return (
    <InfoSection title="Thành viên" count={0}>
      {list.loaded && (
        <div className="flex items-center gap-2.5 py-1 text-[14px] text-ink">
          <IconUsers size={18} className="text-ink-soft" /> {formatNumber(list.total)} thành viên
        </div>
      )}
      {list.error && <p className="text-[12px] text-red-600 dark:text-red-400">{list.error}</p>}
      <ul className="mt-1">
        {list.items.map((m) => {
          const name = m.isSelf ? "Bạn" : m.name?.trim() || "Chưa rõ tên";
          return (
            <li key={m.userId} className="flex items-center gap-2.5 px-1 py-1.5" title={m.userId}>
              <ContactAvatar name={name} seed={m.userId} url={m.avatarUrl} size="sm" />
              <span className={`min-w-0 truncate text-[14px] ${m.name || m.isSelf ? "text-ink" : "italic text-ink-soft"}`}>{name}</span>
            </li>
          );
        })}
      </ul>
      {list.hasMore && (
        <MoreButton label={list.items.length <= 5 ? "Xem tất cả" : "Xem thêm"} onClick={list.more} busy={list.busy} />
      )}
    </InfoSection>
  );
}
