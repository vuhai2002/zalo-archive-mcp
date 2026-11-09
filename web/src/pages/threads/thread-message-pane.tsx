import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useArchiveTimeZone, useDashboardShell } from "../../layout/dashboard-shell-context";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { EmptyState, ErrorNote, LoadingText } from "../../shared/ui-bits";
import { useArchiveLiveChanges } from "../../shared/use-archive-live-changes";
import { useLoadMoreWhenVisible } from "../../shared/use-load-more-when-visible";
import { ChatItemRow, itemHasMessage, rowSelection } from "./chat-item-row";
import { JumpToLatestButton } from "./jump-to-latest-button";
import { MessageComposer } from "./message-composer";
import { MessageSelectionBar } from "./message-selection-bar";
import { PendingOutgoingBubbles } from "./pending-outgoing-bubbles";
import { usePendingOutgoing } from "./use-pending-outgoing";
import { useMessageActions } from "./use-message-actions";
import { layoutMessages } from "./message-grouping";
import { MediaViewerProvider } from "./media-viewer-context";
import { collapseAlbums } from "./photo-album-grouping";
import { ThreadChatHeader } from "./thread-chat-header";
import { ThreadInfoPanel } from "./thread-info-panel";
import { ThreadSearchPanel } from "./thread-search-panel";
import { useChatSidePanel } from "./use-chat-side-panel";
import { awayFromLatest, nextStickToBottom } from "./stick-to-bottom-scroll";
import { scrollToMessage, useMessageJump, type MessageFocus, type ScrollIntent } from "./use-message-jump";
import { useThreadMessages } from "./use-thread-messages";

export function ThreadMessagePane({ threadId, focus, onBack }: { threadId: string; focus: MessageFocus | null; onBack: () => void }) {
  const tz = useArchiveTimeZone();
  // Nick Chỉ đọc: không có ô soạn tin (máy chủ cũng từ chối mọi lệnh gửi)
  const readOnly = useDashboardShell().session?.account?.readOnly ?? false;
  // Mở thẳng tại một tin (bấm kết quả tìm chung): trang đầu tải quanh tin đó thay vì trang mới nhất
  const initialFocusId = useRef(focus?.messageId).current;
  const t = useThreadMessages(threadId, initialFocusId);
  // Trả lời, Chia sẻ, Copy, Chọn nhiều tin nhắn, Xóa khỏi kho
  const acts = useMessageActions({ readOnly, onDeleted: t.dropMessages });
  const scrollRef = useRef<HTMLDivElement>(null);
  const intent = useRef<ScrollIntent | null>(initialFocusId ? { kind: "message", id: initialFocusId } : { kind: "bottom" });
  const stickToBottom = useRef(!initialFocusId);
  const lastScrollTop = useRef(0);
  // Đã kéo lên đọc tin cũ: hiện nút về tin mới nhất. Chỉ đổi khi vượt ngưỡng nên không vẽ lại mỗi lần cuộn
  const [awayFromBottom, setAwayFromBottom] = useState(false);
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

  /** Nút "Tin mới nhất": tin mới nhất đã có sẵn thì nhảy thẳng xuống đáy; đang xem đoạn cũ thì tải lại phần mới nhất */
  const goToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!t.atLatest || !el) return backToLatest();
    stickToBottom.current = true;
    el.scrollTop = el.scrollHeight;
  }, [t.atLatest, backToLatest]);

  // Tin vừa gõ hiện ngay (bong bóng tạm) tới khi daemon gửi xong và listener ghi tin thật vào kho
  const pending = usePendingOutgoing({ messages: t.messages, scrollRef, stickToBottom, atLatest: t.atLatest, backToLatest, refreshLatest });

  // Xin lại link + tải lại mất vài giây (lâu hơn nếu phải chờ lượt): hỏi lại kho hai nhịp
  const afterMediaRetried = useCallback(() => {
    setTimeout(() => void refreshLatest(), 6_000);
    setTimeout(() => void refreshLatest(), 20_000);
  }, [refreshLatest]);

  const { keepJumpTargetInView } = jump;
  const onMediaLoad = useCallback(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
    else keepJumpTargetInView();
  }, [keepJumpTargetInView]);

  // Bấm ô trích dẫn: nhảy tới tin gốc như bấm kết quả tìm (tin xa thì tải đoạn quanh nó)
  const { jumpToMessage } = jump;
  const jumpToQuoted = useCallback((id: number) => void jumpToMessage(id), [jumpToMessage]);
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

      {/* Vùng tin nhắn bọc riêng để nút "Tin mới nhất" neo vào góc dưới của nó, ngay trên ô soạn (như Zalo) */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          stickToBottom.current = nextStickToBottom({
            stick: stickToBottom.current,
            atLatest: t.atLatest,
            scrollTop: el.scrollTop,
            prevScrollTop: lastScrollTop.current,
            distanceFromBottom,
          });
          lastScrollTop.current = el.scrollTop;
          setAwayFromBottom(awayFromLatest(distanceFromBottom));
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
            timeZone={tz}
            onMediaLoad={onMediaLoad}
            onMediaRetried={afterMediaRetried}
            onJumpToMessage={jumpToQuoted}
            actions={acts.actions}
            selection={acts.selected ? rowSelection(acts.selected, item, acts.toggle) : undefined}
          />
        ))}
        <PendingOutgoingBubbles items={pending.visible} onDismiss={pending.dismiss} />
        {/* Đang xem đoạn cũ (nhảy từ kết quả tìm): cuộn xuống là tải tiếp tin mới hơn */}
        <div ref={newerRef} aria-hidden="true" className="h-px" />
        {t.loadingNewer && <p className="pt-1 text-center text-[12px] text-chat-time">Đang tải tin mới hơn...</p>}
      </div>

      {/* Kéo lên đọc tin cũ, hoặc đang xem đoạn cũ vừa nhảy tới: nút về tin mới nhất như Zalo */}
      {(!t.atLatest || awayFromBottom) && !t.loading && t.messages.length > 0 && <JumpToLatestButton onClick={goToLatest} />}
      </div>

      {acts.selected ? (
        <MessageSelectionBar count={acts.selected.size} onDelete={acts.deleteSelected} onCancel={acts.cancelSelect} />
      ) : readOnly ? (
        <div className="border-t border-line bg-surface px-4 py-3 text-center text-[13px] text-ink-soft">
          Nick này đang ở chế độ <b>Chỉ đọc</b>: kho chỉ nghe và lưu tin, không gửi gì. Đổi trong trang Tài khoản Zalo.
        </div>
      ) : (
        <MessageComposer
          threadId={threadId}
          threadName={threadDisplayName(t.thread?.name)}
          onQueued={pending.add}
          replyTarget={acts.replyTarget}
          onCancelReply={acts.cancelReply}
        />
      )}
      {acts.overlays}
    </div>
    {side.panel === "info" && t.thread && <ThreadInfoPanel thread={t.thread} timeZone={tz} onClose={side.toggleInfo} />}
    {side.panel === "search" && (
      <ThreadSearchPanel threadId={threadId} timeZone={tz} onClose={side.closeSearch} onJump={(id) => void jump.jumpToMessage(id)} />
    )}
    </div>
    </MediaViewerProvider>
  );
}
