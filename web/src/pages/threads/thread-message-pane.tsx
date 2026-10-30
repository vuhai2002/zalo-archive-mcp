import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useArchiveTimeZone, useDashboardShell } from "../../layout/dashboard-shell-context";
import { IconChevronDown } from "../../shared/dashboard-icons";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { EmptyState, ErrorNote, LoadingText } from "../../shared/ui-bits";
import { useArchiveLiveChanges } from "../../shared/use-archive-live-changes";
import { useLoadMoreWhenVisible } from "../../shared/use-load-more-when-visible";
import { ChatItemRow, itemHasMessage } from "./chat-item-row";
import { MessageComposer } from "./message-composer";
import { layoutMessages } from "./message-grouping";
import { MediaViewerProvider } from "./media-viewer-context";
import { collapseAlbums } from "./photo-album-grouping";
import { ThreadChatHeader } from "./thread-chat-header";
import { ThreadInfoPanel } from "./thread-info-panel";
import { ThreadSearchPanel } from "./thread-search-panel";
import { useChatSidePanel } from "./use-chat-side-panel";
import { scrollToMessage, useMessageJump, type MessageFocus, type ScrollIntent } from "./use-message-jump";
import { useThreadMessages } from "./use-thread-messages";

/** Cách đáy dưới ngần này coi như "đang đọc tin mới nhất" - ảnh tải xong thì kéo theo xuống đáy */
const STICK_PX = 80;

export function ThreadMessagePane({ threadId, focus, onBack }: { threadId: string; focus: MessageFocus | null; onBack: () => void }) {
  const tz = useArchiveTimeZone();
  // Nick Chỉ đọc: không có ô soạn tin (máy chủ cũng từ chối mọi lệnh gửi)
  const readOnly = useDashboardShell().session?.account?.readOnly ?? false;
  // Mở thẳng tại một tin (bấm kết quả tìm chung): trang đầu tải quanh tin đó thay vì trang mới nhất
  const initialFocusId = useRef(focus?.messageId).current;
  const t = useThreadMessages(threadId, initialFocusId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intent = useRef<ScrollIntent | null>(initialFocusId ? { kind: "message", id: initialFocusId } : { kind: "bottom" });
  const stickToBottom = useRef(!initialFocusId);
  const side = useChatSidePanel();
  const jump = useMessageJump({ focus, jumpTo: t.jumpTo, intent, scrollRef, stickToBottom });

  // Áp ý định cuộn NGAY sau khi DOM đổi, trước khi trình duyệt vẽ: tải tin cũ
  // chèn lên đầu mà không bù scrollTop thì khung nhảy mất chỗ đang đọc.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const want = intent.current;
    if (!el || !want || t.messages.length === 0) return;
    if (want.kind === "bottom") el.scrollTop = el.scrollHeight;
    else if (want.kind === "keep") el.scrollTop = want.prevTop + (el.scrollHeight - want.prevHeight);
    else scrollToMessage(el, want.id);
    intent.current = null;
  }, [t.messages]);

  const loadOlder = () => {
    const el = scrollRef.current;
    if (el) intent.current = { kind: "keep", prevHeight: el.scrollHeight, prevTop: el.scrollTop };
    void t.loadOlder();
  };

  // Tin cũ (cuộn lên) và tin mới hơn (cuộn xuống sau khi nhảy tới tin cũ) không tải cùng lúc:
  // ý định "giữ chỗ" của lần tải tin cũ chỉ đúng khi không có gì chèn thêm ở đáy
  const busy = t.loadingOlder || t.loadingNewer;
  const olderRef = useRef<HTMLDivElement>(null);
  useLoadMoreWhenVisible({
    sentinel: olderRef,
    root: scrollRef,
    enabled: t.hasOlder && !t.olderError && t.messages.length > 0,
    busy,
    onLoadMore: loadOlder,
  });
  const newerRef = useRef<HTMLDivElement>(null);
  useLoadMoreWhenVisible({ sentinel: newerRef, root: scrollRef, enabled: !t.atLatest && t.messages.length > 0, busy, onLoadMore: () => void t.loadNewer() });

  const { refreshLatest, reload } = t;
  const refreshToBottom = useCallback(() => {
    // Ghi đè luôn ý định cũ (vd "giữ chỗ" còn sót khi lần tải tin cũ trả về rỗng)
    intent.current = stickToBottom.current ? { kind: "bottom" } : null;
    void refreshLatest();
  }, [refreshLatest]);

  // Tin mới / cảm xúc / ảnh vừa tải xong của hội thoại này (SSE): tải lại phần mới nhất; đang ở
  // đáy thì kéo theo xuống, đang đọc tin cũ thì giữ nguyên chỗ
  useArchiveLiveChanges((change) => {
    if (change === "all" || change.includes(threadId)) refreshToBottom();
  });

  /** Về tin mới nhất (đang xem đoạn cũ sau khi nhảy từ kết quả tìm) */
  const backToLatest = useCallback(() => {
    intent.current = { kind: "bottom" };
    stickToBottom.current = true;
    void reload();
  }, [reload]);

  // Tin daemon vừa gửi phải chờ listener ghi lại mới có trong kho - hỏi lại sau một nhịp
  const afterSent = useCallback(() => {
    if (!t.atLatest) return backToLatest();
    intent.current = { kind: "bottom" };
    stickToBottom.current = true;
    setTimeout(() => void refreshLatest(), 2_000);
  }, [refreshLatest, t.atLatest, backToLatest]);

  // Xin lại link + tải lại mất vài giây (lâu hơn nếu phải chờ lượt): hỏi lại kho hai nhịp
  const afterMediaRetried = useCallback(() => {
    setTimeout(() => void refreshLatest(), 6_000);
    setTimeout(() => void refreshLatest(), 20_000);
  }, [refreshLatest]);

  const onMediaLoad = useCallback(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, []);

  const byMsgId = useMemo(() => new Map(t.messages.map((m) => [m.msgId, m] as const)), [t.messages]);
  const isGroup = t.thread?.threadType === "group";
  // Ảnh cùng album gộp thành một mục trước khi xếp cụm / vạch giờ
  const items = useMemo(() => collapseAlbums(t.messages), [t.messages]);
  const layouts = useMemo(() => layoutMessages(items.map((x) => x.msg), tz), [items, tz]);

  return (
    <MediaViewerProvider threadId={threadId} threadName={threadDisplayName(t.thread?.name)} timeZone={tz} onOpenMessage={(id) => void jump.jumpToMessage(id)}>
    <div className="relative flex h-full min-h-0 overflow-hidden bg-surface">
    <div className="relative flex min-w-0 flex-1 flex-col">
      <ThreadChatHeader
        threadId={threadId}
        thread={t.thread}
        onBack={onBack}
        panel={side.panel}
        onToggleInfo={side.toggleInfo}
        onToggleSearch={side.toggleSearch}
      />

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = t.atLatest && el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
        }}
        className="scrollbar-stable min-h-0 flex-1 overflow-y-auto bg-chat px-3 pb-4 pt-3 sm:px-6"
      >
        {t.loading && <LoadingText />}
        {t.error && <ErrorNote message={t.error} onRetry={() => void t.reload()} />}
        {!t.loading && !t.error && t.messages.length === 0 && <EmptyState text="Hội thoại này chưa có tin nào trong kho." />}

        {/* Cuộn gần lên đầu là tự tải tin cũ hơn, như Zalo; hỏng thì có nút thử lại */}
        <div ref={olderRef} aria-hidden="true" className="h-px" />
        {t.loadingOlder && <p className="pb-1 text-center text-[12px] text-chat-time">Đang tải tin cũ hơn...</p>}
        {t.olderError && (
          <p className="text-center text-[12px] text-red-600 dark:text-red-400">
            {t.olderError}{" "}
            <button type="button" onClick={loadOlder} className="font-medium underline">
              Thử lại
            </button>
          </p>
        )}

        {items.map((item, i) => (
          <ChatItemRow
            key={item.msg.id}
            item={item}
            layout={layouts[i]!}
            highlighted={itemHasMessage(item, jump.highlightId)}
            isGroup={isGroup}
            quoted={item.msg.quoteMsgId ? byMsgId.get(item.msg.quoteMsgId) : undefined}
            timeZone={tz}
            onMediaLoad={onMediaLoad}
            onMediaRetried={afterMediaRetried}
          />
        ))}
        {/* Đang xem đoạn cũ (nhảy từ kết quả tìm): cuộn xuống là tải tiếp tin mới hơn */}
        <div ref={newerRef} aria-hidden="true" className="h-px" />
        {t.loadingNewer && <p className="pt-1 text-center text-[12px] text-chat-time">Đang tải tin mới hơn...</p>}
      </div>

      {!t.atLatest && !t.loading && (
        <button
          type="button"
          onClick={backToLatest}
          className="absolute bottom-20 right-5 z-10 flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-zalo-500 shadow-md hover:bg-tile"
        >
          <IconChevronDown size={16} /> Tin mới nhất
        </button>
      )}

      {readOnly ? (
        <div className="border-t border-line bg-surface px-4 py-3 text-center text-[13px] text-ink-soft">
          Nick này đang ở chế độ <b>Chỉ đọc</b>: kho chỉ nghe và lưu tin, không gửi gì. Đổi trong trang Tài khoản Zalo.
        </div>
      ) : (
        <MessageComposer threadId={threadId} onSent={afterSent} />
      )}
    </div>
    {side.panel === "info" && t.thread && <ThreadInfoPanel thread={t.thread} timeZone={tz} onClose={side.toggleInfo} />}
    {side.panel === "search" && (
      <ThreadSearchPanel threadId={threadId} timeZone={tz} onClose={side.closeSearch} onJump={(id) => void jump.jumpToMessage(id)} />
    )}
    </div>
    </MediaViewerProvider>
  );
}
