import { useEffect, useRef, useState } from "react";
import { IconClose, IconSearch } from "../../shared/dashboard-icons";
import { BTN_ICON, ErrorNote, LoadingText } from "../../shared/ui-bits";
import { useDebouncedValue } from "../../shared/use-debounced-value";
import type { DateRange } from "./search-date-presets";
import { FileHitRow, MessageHitRow, WideButton } from "./search-hit-rows";
import { DateFilter, SenderFilter, type SenderPick } from "./thread-search-filters";
import { usePagedMessageSearch, type MessageSearchParams } from "./use-paged-message-search";

const PAGE = { messages: 20, files: 10 } as const;

/**
 * Bảng "Tìm kiếm trong trò chuyện" bên phải khung chat, như Zalo PC: ô tìm, lọc theo người gửi / ngày
 * gửi, rồi hai mục Tin nhắn và File (mỗi mục có "Xem thêm"). Bấm một kết quả là khung chat nhảy tới
 * đúng tin đó. Từ xl là một cột cố định; nhỏ hơn thì phủ lên khung chat và tự đóng sau khi nhảy.
 */
export function ThreadSearchPanel({
  threadId,
  timeZone,
  onClose,
  onJump,
}: {
  threadId: string;
  timeZone: string;
  onClose: () => void;
  onJump: (messageId: number) => void;
}) {
  const [text, setText] = useState("");
  const [sender, setSender] = useState<SenderPick | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const q = useDebouncedValue(text.trim(), 300);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const ready = q !== "" || sender !== null || range !== null;
  const base: MessageSearchParams | null = ready
    ? { q: q || undefined, threadId, senderId: sender?.senderId, fromDate: range?.from, toDate: range?.to }
    : null;
  const messages = usePagedMessageSearch(base && { ...base, files: "exclude" }, PAGE.messages);
  const files = usePagedMessageSearch(base && { ...base, files: "only" }, PAGE.files);

  const open = (id: number) => {
    onJump(id);
    if (!window.matchMedia("(min-width: 1280px)").matches) onClose();
  };
  const nothing = messages.items?.length === 0 && files.items?.length === 0;

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full flex-col sm:w-[360px] border-l border-line bg-surface shadow-xl xl:static xl:shadow-none">
      <div className="flex h-[68px] shrink-0 items-center border-b border-line px-4">
        <h3 className="flex-1 text-center text-[17px] font-semibold text-ink">Tìm kiếm trong trò chuyện</h3>
        <button type="button" onClick={onClose} aria-label="Đóng tìm kiếm trong trò chuyện" className={BTN_ICON}>
          <IconClose size={18} />
        </button>
      </div>

      <div className="shrink-0 border-b border-line px-4 pb-3 pt-3">
        <div className="relative">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/70" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (text ? setText("") : onClose())}
            placeholder="Nhập từ khóa để tìm kiếm"
            aria-label="Tìm trong trò chuyện"
            className="gc-input w-full py-2 pl-9 pr-14"
          />
          {text && (
            <button type="button" onClick={() => setText("")} className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 text-[13px] text-ink-soft hover:text-ink">
              Xóa
            </button>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="shrink-0 text-[13px] text-ink-soft">Lọc theo:</span>
          <SenderFilter threadId={threadId} value={sender} onChange={setSender} />
          <DateFilter timeZone={timeZone} value={range} onChange={setRange} />
        </div>
      </div>

      <div className="scrollbar-stable min-h-0 flex-1 overflow-y-auto">
        {!ready && <p className="px-6 py-10 text-center text-[13.5px] text-ink-soft">Nhập từ khóa, hoặc chọn người gửi / ngày gửi để tìm tin nhắn và file trong trò chuyện này.</p>}
        {ready && nothing && <p className="px-6 py-10 text-center text-[13.5px] text-ink-soft">Không có tin nhắn hay file nào khớp.</p>}
        {ready && !nothing && (
          <>
            <Section title="Tin nhắn" list={messages} hideWhenEmpty={false}>
              {messages.items?.map((m) => <MessageHitRow key={m.id} m={m} query={q} timeZone={timeZone} inThread onClick={() => open(m.id)} />)}
            </Section>
            <Section title="File" list={files} hideWhenEmpty>
              {files.items?.map((m) => <FileHitRow key={m.id} m={m} query={q} timeZone={timeZone} onClick={() => open(m.id)} />)}
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}

function Section({
  title,
  list,
  hideWhenEmpty,
  children,
}: {
  title: string;
  list: ReturnType<typeof usePagedMessageSearch>;
  hideWhenEmpty: boolean;
  children: React.ReactNode;
}) {
  if (hideWhenEmpty && list.items?.length === 0) return null;
  return (
    <section className="border-b-8 border-tile">
      <h4 className="px-4 pb-1 pt-3 text-[14.5px] font-semibold text-ink">{title}</h4>
      {list.error && <div className="px-4 pb-2"><ErrorNote message={list.error} /></div>}
      {list.items === null && !list.error && <LoadingText text="Đang tìm..." />}
      {list.items?.length === 0 && <p className="px-4 pb-3 text-[13px] text-ink-soft">Không có {title.toLowerCase()} nào khớp.</p>}
      <ul>{children}</ul>
      {list.hasMore && <WideButton label="Xem thêm" onClick={list.loadMore} busy={list.loadingMore} />}
    </section>
  );
}
