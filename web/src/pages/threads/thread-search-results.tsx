import { useEffect, useRef, useState } from "react";
import type { SearchResult, ThreadListItem } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { IconFileText } from "../../shared/action-and-media-icons";
import { ContactAvatar } from "../../shared/contact-avatar";
import { highlightMatches } from "../../shared/highlight-search-match";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { EmptyState, ErrorNote, LoadingText } from "../../shared/ui-bits";
import { zaloListTime } from "../../shared/zalo-list-time-and-preview";
import { ThreadListRow } from "./thread-list-row";

export type SearchTab = "all" | "contacts" | "messages" | "files";
export const SEARCH_TABS: Array<{ id: SearchTab; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "contacts", label: "Liên hệ" },
  { id: "messages", label: "Tin nhắn" },
  { id: "files", label: "File" },
];

/** Tìm tin tối đa chừng này kết quả mới nhất; đủ thì ghi "100+" như Zalo ghi "17+" */
const MESSAGE_LIMIT = 100;
/** Tab "Tất cả" chỉ xem gọn mỗi mục vài dòng, bấm "Xem tất cả" sang tab riêng */
const PREVIEW = { contacts: 3, messages: 5, files: 3 } as const;

const hasFile = (m: SearchResult) => m.attachments.some((a) => a.kind === "file");

/**
 * Kết quả tìm kiếm ngay trong cột danh sách, như Zalo PC: liên hệ (hội thoại khớp tên), tin nhắn
 * (khớp nội dung, không dấu) và file (khớp tên file). `scopeThreadId`: chỉ tìm trong một hội thoại.
 */
export function ThreadSearchResults({
  query,
  tab,
  onTab,
  contacts,
  scopeThreadId,
  timeZone,
  onSelect,
  onTogglePin,
}: {
  query: string;
  tab: SearchTab;
  onTab: (t: SearchTab) => void;
  contacts: ThreadListItem[];
  scopeThreadId: string | null;
  timeZone: string;
  onSelect: (threadId: string) => void;
  onTogglePin: (t: ThreadListItem) => void;
}) {
  const [found, setFound] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!query) return setFound(null);
    const my = ++seq.current;
    setFound(null);
    setError(null);
    api
      .search({ q: query, threadId: scopeThreadId ?? undefined, limit: MESSAGE_LIMIT })
      .then((r) => my === seq.current && setFound(r.messages))
      .catch((err: unknown) => my === seq.current && setError(errorText(err)));
  }, [query, scopeThreadId]);

  if (!query) return <EmptyState text={scopeThreadId ? "Gõ để tìm tin, file trong hội thoại này." : "Gõ tên người, nhóm, nội dung tin hoặc tên file."} />;
  if (error) return <div className="p-3"><ErrorNote message={error} /></div>;

  const files = found?.filter(hasFile) ?? [];
  const people = scopeThreadId ? [] : contacts;
  const count = (n: number, capped: boolean) => `${n}${capped ? "+" : ""}`;
  const section = (id: SearchTab, title: string, n: string, shown: number, total: number, body: React.ReactNode) =>
    total === 0 ? null : (
      <section className="border-b border-line pb-1">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h4 className="text-[14px] font-semibold text-ink">
            {title} ({n})
          </h4>
          {tab === "all" && total > shown && (
            <button type="button" onClick={() => onTab(id)} className="text-[13px] font-medium text-zalo-500 hover:underline">
              Xem tất cả
            </button>
          )}
        </div>
        {body}
      </section>
    );

  const take = <T,>(list: T[], key: keyof typeof PREVIEW) => (tab === "all" ? list.slice(0, PREVIEW[key]) : list);
  const showContacts = (tab === "all" || tab === "contacts") && !scopeThreadId;
  const showMessages = tab === "all" || tab === "messages";
  const showFiles = tab === "all" || tab === "files";
  const nothing = found !== null && people.length === 0 && found.length === 0;

  return (
    <div>
      {showContacts &&
        section("contacts", "Liên hệ", String(people.length), take(people, "contacts").length, people.length,
          <ul>{take(people, "contacts").map((t) => <li key={t.threadId}><ThreadListRow t={t} active={false} timeZone={timeZone} onSelect={onSelect} onTogglePin={onTogglePin} /></li>)}</ul>)}
      {found === null && <LoadingText text="Đang tìm tin..." />}
      {found && showMessages &&
        section("messages", "Tin nhắn", count(found.length, found.length >= MESSAGE_LIMIT), take(found, "messages").length, found.length,
          <ul>{take(found, "messages").map((m) => <MessageHit key={m.id} m={m} query={query} timeZone={timeZone} onSelect={onSelect} />)}</ul>)}
      {found && showFiles &&
        section("files", "File", String(files.length), take(files, "files").length, files.length,
          <ul>{take(files, "files").map((m) => <FileHit key={m.id} m={m} query={query} timeZone={timeZone} onSelect={onSelect} />)}</ul>)}
      {nothing && <EmptyState text="Không có kết quả nào khớp." />}
    </div>
  );
}

function MessageHit({ m, query, timeZone, onSelect }: { m: SearchResult; query: string; timeZone: string; onSelect: (id: string) => void }) {
  const sender = m.isSelf ? "Bạn" : m.senderName?.trim() || m.senderId;
  const name = threadDisplayName(m.threadName);
  return (
    <li>
      <button type="button" onClick={() => onSelect(m.threadId)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-tile/70">
        <ContactAvatar name={name} seed={m.threadId} url={m.threadAvatarUrl} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] text-ink-soft">{name}</span>
            <span className="shrink-0 text-[12px] text-ink-soft">{zaloListTime(m.sentAt, timeZone)}</span>
          </span>
          <span className="mt-0.5 line-clamp-2 text-[14px] text-ink [overflow-wrap:anywhere]">
            {m.threadType === "group" || m.isSelf ? `${sender}: ` : ""}
            {highlightMatches(m.text, query)}
          </span>
        </span>
      </button>
    </li>
  );
}

function FileHit({ m, query, timeZone, onSelect }: { m: SearchResult; query: string; timeZone: string; onSelect: (id: string) => void }) {
  const file = m.attachments.find((a) => a.kind === "file");
  return (
    <li>
      <button type="button" onClick={() => onSelect(m.threadId)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-tile/70">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zalo-50 text-zalo-500 dark:bg-zalo-500/15">
          <IconFileText size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink">{highlightMatches(file?.fileName ?? "File", query)}</span>
          <span className="flex justify-between gap-2 text-[12px] text-ink-soft">
            <span className="truncate">{threadDisplayName(m.threadName)}</span>
            <span className="shrink-0">{zaloListTime(m.sentAt, timeZone)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
