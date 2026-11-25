import { useState, type ReactNode } from "react";
import type { SearchResult, ThreadListItem } from "../../archive-api-types";
import { EmptyState, ErrorNote, LoadingText } from "../../shared/ui-bits";
import { GlobalSenderFilter } from "./global-sender-filter";
import type { DateRange } from "./search-date-presets";
import { DateFilter, type SenderPick } from "./thread-search-filters";
import type { RecentThread } from "./recent-search-threads";
import { ContactHitRow, FileHitRow, MessageHitRow, WideButton } from "./search-hit-rows";
import { SearchStartPanel } from "./search-start-panel";
import { usePagedMessageSearch } from "./use-paged-message-search";

export type SearchTab = "all" | "contacts" | "messages" | "files";
export const SEARCH_TABS: Array<{ id: SearchTab; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "contacts", label: "Liên hệ" },
  { id: "messages", label: "Tin nhắn" },
  { id: "files", label: "File" },
];

/** Tab "Tất cả" xem gọn mỗi mục vài dòng như Zalo, đếm tới 20 ("20+"); tab riêng thì tải từng trang */
const PREVIEW = 3;
const ALL_PAGE = 20;
const TAB_PAGE = 30;

/**
 * Kết quả tìm chung ngay trong cột danh sách, như Zalo PC. Chưa gõ gì: "Tìm gần đây" + "Lọc tin nhắn".
 * Gõ rồi: Liên hệ (hội thoại khớp tên), Tin nhắn (khớp nội dung, không dấu), File (khớp tên file); bấm
 * một tin hay file là mở hội thoại và nhảy tới đúng tin đó.
 */
export function ThreadSearchResults({
  query,
  tab,
  onTab,
  contacts,
  timeZone,
  onOpenThread,
  onOpenMessage,
}: {
  query: string;
  tab: SearchTab;
  onTab: (t: SearchTab) => void;
  contacts: ThreadListItem[];
  timeZone: string;
  onOpenThread: (t: RecentThread) => void;
  onOpenMessage: (m: SearchResult) => void;
}) {
  const all = tab === "all";
  // Lọc theo người gửi / ngày gửi như Zalo PC: chỉ ở tab Tin nhắn và File (tab Tất cả xem gọn, không lọc)
  const [sender, setSender] = useState<SenderPick | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const filtered = tab === "messages" || tab === "files";
  const extra = filtered ? { senderId: sender?.senderId, fromDate: range?.from, toDate: range?.to } : {};
  const messages = usePagedMessageSearch(query && (all || tab === "messages") ? { q: query, files: "exclude", ...extra } : null, all ? ALL_PAGE : TAB_PAGE);
  const files = usePagedMessageSearch(query && (all || tab === "files") ? { q: query, files: "only", ...extra } : null, all ? ALL_PAGE : TAB_PAGE);

  if (!query) return <SearchStartPanel timeZone={timeZone} onOpenThread={onOpenThread} onOpenMessage={onOpenMessage} />;

  const take = <T,>(list: T[]) => (all ? list.slice(0, PREVIEW) : list);
  const count = (n: number, more: boolean) => `${n}${more ? "+" : ""}`;
  const section = (title: string, n: string, rows: ReactNode, footer: ReactNode) => (
    <section className="border-b border-line">
      <h4 className="px-4 pb-1 pt-3 text-[14.5px] font-semibold text-ink">
        {title} ({n})
      </h4>
      <ul>{rows}</ul>
      {footer}
    </section>
  );
  const footer = (id: SearchTab, label: string, list: typeof messages) =>
    all
      ? (list.items?.length ?? 0) > PREVIEW && <WideButton label={label} onClick={() => onTab(id)} />
      : list.hasMore && <WideButton label="Xem thêm" onClick={list.loadMore} busy={list.loadingMore} />;

  const showContacts = (all || tab === "contacts") && contacts.length > 0;
  const loading = (all || tab !== "contacts") && (messages.items === null || files.items === null) && !messages.error && !files.error;
  const nothing =
    !loading &&
    (!(all || tab === "contacts") || contacts.length === 0) &&
    (!(all || tab === "messages") || messages.items?.length === 0) &&
    (!(all || tab === "files") || files.items?.length === 0);

  return (
    <div>
      {filtered && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="shrink-0 text-[13px] text-ink-soft">Lọc theo:</span>
          <GlobalSenderFilter value={sender} onChange={setSender} />
          <div className="min-w-0 flex-1">
            <DateFilter timeZone={timeZone} value={range} onChange={setRange} />
          </div>
        </div>
      )}
      {showContacts &&
        section(
          "Liên hệ",
          String(contacts.length),
          take(contacts).map((t) => <ContactHitRow key={t.threadId} t={t} query={query} onClick={() => onOpenThread(t)} />),
          all && contacts.length > PREVIEW && <WideButton label="Xem tất cả liên hệ" onClick={() => onTab("contacts")} />,
        )}
      {(messages.error || files.error) && <div className="p-3"><ErrorNote message={(messages.error ?? files.error)!} /></div>}
      {loading && <LoadingText text="Đang tìm..." />}
      {(all || tab === "messages") && !!messages.items?.length &&
        section(
          "Tin nhắn",
          count(messages.items.length, messages.hasMore),
          take(messages.items).map((m) => <MessageHitRow key={m.id} m={m} query={query} timeZone={timeZone} onClick={() => onOpenMessage(m)} />),
          footer("messages", "Xem tất cả tin nhắn", messages),
        )}
      {(all || tab === "files") && !!files.items?.length &&
        section(
          "File",
          count(files.items.length, files.hasMore),
          take(files.items).map((m) => <FileHitRow key={m.id} m={m} query={query} timeZone={timeZone} onClick={() => onOpenMessage(m)} />),
          footer("files", "Xem tất cả files", files),
        )}
      {nothing && <EmptyState text="Không có kết quả nào khớp." />}
    </div>
  );
}
