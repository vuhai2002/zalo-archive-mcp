import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useArchiveTimeZone, useDashboardShell } from "../../layout/dashboard-shell-context";
import { EmptyState, ErrorNote, LoadingText } from "../../shared/ui-bits";
import { useArchiveLiveChanges } from "../../shared/use-archive-live-changes";
import { useLoadMoreWhenVisible } from "../../shared/use-load-more-when-visible";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { layoutMessages } from "./message-grouping";
import { collapseAlbums } from "./photo-album-grouping";
import { ThreadChatHeader } from "./thread-chat-header";
import { ThreadInfoPanel } from "./thread-info-panel";
import { useThreadMessages } from "./use-thread-messages";

/** Cách đáy dưới ngần này coi như "đang đọc tin mới nhất" - ảnh tải xong thì kéo theo xuống đáy */
const STICK_PX = 80;

type ScrollIntent = { kind: "bottom" } | { kind: "keep"; prevHeight: number; prevTop: number };

export function ThreadMessagePane({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const tz = useArchiveTimeZone();
  // Nick Chỉ đọc: không có ô soạn tin (máy chủ cũng từ chối mọi lệnh gửi)
  const readOnly = useDashboardShell().session?.account?.readOnly ?? false;
  const t = useThreadMessages(threadId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intent = useRef<ScrollIntent | null>({ kind: "bottom" });
  const stickToBottom = useRef(true);
  const [infoOpen, toggleInfo] = useInfoPanelOpen();

  // Áp ý định cuộn NGAY sau khi DOM đổi, trước khi trình duyệt vẽ: tải tin cũ
  // chèn lên đầu mà không bù scrollTop thì khung nhảy mất chỗ đang đọc.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const want = intent.current;
    if (!el || !want || t.messages.length === 0) return;
    if (want.kind === "bottom") el.scrollTop = el.scrollHeight;
    else el.scrollTop = want.prevTop + (el.scrollHeight - want.prevHeight);
    intent.current = null;
  }, [t.messages]);

  const loadOlder = () => {
    const el = scrollRef.current;
    if (el) intent.current = { kind: "keep", prevHeight: el.scrollHeight, prevTop: el.scrollTop };
    void t.loadOlder();
  };

  const olderRef = useRef<HTMLDivElement>(null);
  useLoadMoreWhenVisible({
    sentinel: olderRef,
    root: scrollRef,
    enabled: t.hasOlder && !t.olderError && t.messages.length > 0,
    busy: t.loadingOlder,
    onLoadMore: loadOlder,
  });

  const { refreshLatest } = t;
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

  // Tin daemon vừa gửi phải chờ listener ghi lại mới có trong kho - hỏi lại sau một nhịp
  const afterSent = useCallback(() => {
    intent.current = { kind: "bottom" };
    stickToBottom.current = true;
    setTimeout(() => void refreshLatest(), 2_000);
  }, [refreshLatest]);

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
    <div className="relative flex h-full min-h-0 overflow-hidden bg-surface">
    <div className="flex min-w-0 flex-1 flex-col">
      <ThreadChatHeader
        threadId={threadId}
        thread={t.thread}
        onBack={onBack}
        infoOpen={infoOpen}
        onToggleInfo={toggleInfo}
      />

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
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

        {items.map(({ msg: m, album }, i) => (
          <Fragment key={m.id}>
            {layouts[i]!.separatorLabel && (
              <div className="mb-1 mt-4 flex justify-center first:mt-1">
                <span className="rounded-full bg-black/25 px-3 py-1 text-[12px] font-medium text-white dark:bg-white/15">
                  {layouts[i]!.separatorLabel}
                </span>
              </div>
            )}
            <MessageBubble
              msg={m}
              album={album}
              isGroup={isGroup}
              quoted={m.quoteMsgId ? byMsgId.get(m.quoteMsgId) : undefined}
              timeZone={tz}
              first={layouts[i]!.firstInGroup}
              last={layouts[i]!.lastInGroup}
              onMediaLoad={onMediaLoad}
              onMediaRetried={afterMediaRetried}
            />
          </Fragment>
        ))}
      </div>

      {readOnly ? (
        <div className="border-t border-line bg-surface px-4 py-3 text-center text-[13px] text-ink-soft">
          Nick này đang ở chế độ <b>Chỉ đọc</b>: kho chỉ nghe và lưu tin, không gửi gì. Đổi trong trang Tài khoản Zalo.
        </div>
      ) : (
        <MessageComposer threadId={threadId} onSent={afterSent} />
      )}
    </div>
    {infoOpen && t.thread && <ThreadInfoPanel thread={t.thread} timeZone={tz} onClose={toggleInfo} />}
    </div>
  );
}

const INFO_PANEL_KEY = "zalo-archive.thread-info-open";

/**
 * Bảng thông tin bên phải mở hay đóng - nhớ theo trình duyệt (chỉ là tiện ích, hỏng thì mặc định đóng).
 * Chỉ tự mở lại trên màn hình rộng (xl), nơi bảng là một cột riêng; màn hẹp bảng phủ lên khung chat.
 */
function useInfoPanelOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(INFO_PANEL_KEY) === "1" && window.matchMedia("(min-width: 1280px)").matches;
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setOpen((v) => {
      try {
        localStorage.setItem(INFO_PANEL_KEY, v ? "0" : "1");
      } catch {
        // Trình duyệt chặn lưu: vẫn bật/tắt được trong lần mở này
      }
      return !v;
    });
  }, []);
  return [open, toggle];
}
