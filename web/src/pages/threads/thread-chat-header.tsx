import { Link } from "react-router-dom";
import type { ThreadMessagesResponse } from "../../archive-api-types";
import { IconRefresh } from "../../shared/action-and-media-icons";
import { ContactAvatar } from "../../shared/contact-avatar";
import { IconArrowLeft, IconPanelRight, IconSearch } from "../../shared/dashboard-icons";
import { MemberAvatarStack } from "../../shared/member-avatar-stack";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { BTN_ICON, formatNumber } from "../../shared/ui-bits";

type ChatThread = ThreadMessagesResponse["thread"];

/** Dòng phụ dưới tên như Zalo PC: "Nhóm · 25 thành viên" / "Bạn bè", kèm số tin trong kho */
export function chatSubtitle(thread: ChatThread): string {
  const kind =
    thread.threadType === "group"
      ? thread.memberCount
        ? `Nhóm · ${formatNumber(thread.memberCount)} thành viên`
        : "Nhóm"
      : thread.isFriend
        ? "Bạn bè"
        : "Tin nhắn 1-1";
  return `${kind} · ${formatNumber(thread.messageCount)} tin trong kho`;
}

export function ThreadAvatar({ thread, size = "lg" }: { thread: ChatThread; size?: "lg" | "xl" }) {
  return thread.threadType === "group" && !thread.avatarUrl && thread.memberAvatars.length > 0 ? (
    <MemberAvatarStack members={thread.memberAvatars} memberCount={thread.memberCount} seed={thread.threadId} />
  ) : (
    <ContactAvatar name={threadDisplayName(thread.name)} seed={thread.threadId} url={thread.avatarUrl} size={size} />
  );
}

/** Đầu khung chat kiểu Zalo PC: avatar, tên to, dòng phụ; nút tìm, tải tin mới, bật/tắt bảng thông tin */
export function ThreadChatHeader({
  threadId,
  thread,
  onBack,
  onRefresh,
  infoOpen,
  onToggleInfo,
}: {
  threadId: string;
  thread: ChatThread | null;
  onBack: () => void;
  onRefresh: () => void;
  infoOpen: boolean;
  onToggleInfo: () => void;
}) {
  return (
    <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
      <button type="button" onClick={onBack} aria-label="Quay lại danh sách" className={`${BTN_ICON} lg:hidden`}>
        <IconArrowLeft size={18} />
      </button>
      {thread && <ThreadAvatar thread={thread} />}
      <div className="min-w-0 flex-1" title={threadId}>
        <h2 className="truncate text-[17px] font-semibold leading-tight text-ink">{threadDisplayName(thread?.name)}</h2>
        {thread && <div className="mt-0.5 truncate text-[13px] text-ink-soft">{chatSubtitle(thread)}</div>}
      </div>
      <Link to={`/threads/${encodeURIComponent(threadId)}?find=1`} title="Tìm trong hội thoại này" aria-label="Tìm trong hội thoại này" className={BTN_ICON}>
        <IconSearch size={20} />
      </Link>
      <button type="button" onClick={onRefresh} title="Tải tin mới" aria-label="Tải tin mới" className={BTN_ICON}>
        <IconRefresh size={20} />
      </button>
      <button
        type="button"
        onClick={onToggleInfo}
        aria-pressed={infoOpen}
        title={infoOpen ? "Ẩn thông tin hội thoại" : "Thông tin hội thoại: ảnh, file"}
        aria-label="Thông tin hội thoại"
        className={`${BTN_ICON} ${infoOpen ? "bg-zalo-50 text-zalo-500 dark:bg-zalo-500/15" : ""}`}
      >
        <IconPanelRight size={20} />
      </button>
    </div>
  );
}
