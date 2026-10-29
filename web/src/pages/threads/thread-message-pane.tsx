import { Fragment, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useArchiveTimeZone, useDashboardShell } from "../../layout/dashboard-shell-context";
import { IconRefresh } from "../../shared/action-and-media-icons";
import { IconArrowLeft, IconSearch } from "../../shared/dashboard-icons";
import { ContactAvatar } from "../../shared/contact-avatar";
import { MemberAvatarStack } from "../../shared/member-avatar-stack";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { BTN_ICON, EmptyState, ErrorNote, formatNumber, LoadingText } from "../../shared/ui-bits";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { layoutMessages } from "./message-grouping";
import { collapseAlbums } from "./photo-album-grouping";
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

  const { refreshLatest } = t;
  const refreshToBottom = useCallback(() => {
    // Ghi đè luôn ý định cũ (vd "giữ chỗ" còn sót khi lần tải tin cũ trả về rỗng)
    intent.current = stickToBottom.current ? { kind: "bottom" } : null;
    void refreshLatest();
  }, [refreshLatest]);

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
    <div className="gc-card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label="Quay lại danh sách" className={`${BTN_ICON} lg:hidden`}>
          <IconArrowLeft size={18} />
        </button>
        {t.thread &&
          (t.thread.threadType === "group" && !t.thread.avatarUrl && t.thread.memberAvatars.length > 0 ? (
            <MemberAvatarStack members={t.thread.memberAvatars} memberCount={t.thread.memberCount} seed={t.thread.threadId} />
          ) : (
            <ContactAvatar name={threadDisplayName(t.thread.name)} seed={t.thread.threadId} url={t.thread.avatarUrl} size="lg" />
          ))}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold text-ink">{threadDisplayName(t.thread?.name)}</h2>
          </div>
          <div className="truncate text-[12px] text-ink-soft">
            {t.thread ? `${formatNumber(t.thread.messageCount)} tin · ` : ""}
            <span className="font-mono">{threadId}</span>
          </div>
        </div>
        <Link
          to={`/search?threadId=${encodeURIComponent(threadId)}`}
          title="Tìm trong hội thoại này"
          aria-label="Tìm trong hội thoại này"
          className={BTN_ICON}
        >
          <IconSearch size={18} />
        </Link>
        <button type="button" onClick={refreshToBottom} title="Tải tin mới" aria-label="Tải tin mới" className={BTN_ICON}>
          <IconRefresh size={18} />
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-chat px-3 pb-4 pt-3 sm:px-4"
      >
        {t.loading && <LoadingText />}
        {t.error && <ErrorNote message={t.error} onRetry={() => void t.reload()} />}
        {!t.loading && !t.error && t.messages.length === 0 && <EmptyState text="Hội thoại này chưa có tin nào trong kho." />}

        {t.hasOlder && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={loadOlder}
              disabled={t.loadingOlder}
              className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-ink-soft hover:bg-tile hover:text-ink disabled:opacity-60"
            >
              {t.loadingOlder ? "Đang tải..." : "Tải tin cũ hơn"}
            </button>
          </div>
        )}
        {t.olderError && <p className="text-center text-[12px] text-red-600 dark:text-red-400">{t.olderError}</p>}

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
  );
}
