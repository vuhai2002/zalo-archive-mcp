import type { ThreadMessagesResponse } from "../../archive-api-types";
import { ContactAvatar } from "../../shared/contact-avatar";
import { IconArrowLeft, IconPanelRight, IconSearch, IconUser } from "../../shared/dashboard-icons";
import { MemberAvatarStack } from "../../shared/member-avatar-stack";
import type { ChatSidePanel } from "./use-chat-side-panel";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { BTN_ICON, formatNumber } from "../../shared/ui-bits";

type ChatThread = ThreadMessagesResponse["thread"];

/**
 * Dòng phụ dưới tên như Zalo PC: "Nhóm · 25 thành viên" / "Bạn bè" / "Người lạ" (chưa kết bạn) / dòng của My
 * Documents, kèm số tin trong kho
 */
export function chatSubtitle(thread: ChatThread): string {
  const kind =
    thread.threadType === "group"
      ? thread.memberCount
        ? `Nhóm · ${formatNumber(thread.memberCount)} thành viên`
        : "Nhóm"
      : thread.isMyDocuments
        ? "Lưu và đồng bộ dữ liệu giữa các thiết bị"
        : thread.isFriend
          ? "Bạn bè"
          : "Người lạ";
  return `${kind} · ${formatNumber(thread.messageCount)} tin trong kho`;
}

export function ThreadAvatar({ thread, size = "lg" }: { thread: ChatThread; size?: "lg" | "xl" }) {
  return thread.threadType === "group" && !thread.avatarUrl && thread.memberAvatars.length > 0 ? (
    <MemberAvatarStack members={thread.memberAvatars} memberCount={thread.memberCount} seed={thread.threadId} />
  ) : (
    <ContactAvatar name={threadDisplayName(thread.name)} seed={thread.threadId} url={thread.avatarUrl} size={size} />
  );
}

/** Đầu khung chat kiểu Zalo PC: avatar, tên to, dòng phụ; nút tìm, bật/tắt bảng thông tin (tin mới tự hiện qua SSE, không cần nút tải lại) */
export function ThreadChatHeader({
  threadId,
  thread,
  onBack,
  panel,
  onToggleInfo,
  onToggleSearch,
}: {
  threadId: string;
  thread: ChatThread | null;
  onBack: () => void;
  panel: ChatSidePanel;
  onToggleInfo: () => void;
  onToggleSearch: () => void;
}) {
  const on = "bg-zalo-50 text-zalo-500 dark:bg-zalo-500/15";
  // Nút bên phải như Zalo PC: biểu tượng 22px, màu chữ chính (không xám nhạt)
  const btn = "inline-flex items-center justify-center rounded-md p-1.5 text-ink hover:bg-tile";
  return (
    <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
      <button type="button" onClick={onBack} aria-label="Quay lại danh sách" className={`${BTN_ICON} lg:hidden`}>
        <IconArrowLeft size={18} />
      </button>
      {thread && <ThreadAvatar thread={thread} />}
      <div className="min-w-0 flex-1" title={threadId}>
        <h2 className="truncate text-[18px] font-semibold leading-tight text-ink">{threadDisplayName(thread?.name)}</h2>
        {thread && <ChatSubtitleLine thread={thread} />}
      </div>
      <button
        type="button"
        onClick={onToggleSearch}
        aria-pressed={panel === "search"}
        title="Tìm kiếm trong trò chuyện"
        aria-label="Tìm kiếm trong trò chuyện"
        className={`${btn} ${panel === "search" ? on : ""}`}
      >
        <IconSearch size={22} />
      </button>
      <button
        type="button"
        onClick={onToggleInfo}
        aria-pressed={panel === "info"}
        title={panel === "info" ? "Ẩn thông tin hội thoại" : "Thông tin hội thoại: ảnh, file"}
        aria-label="Thông tin hội thoại"
        className={`${btn} ${panel === "info" ? on : ""}`}
      >
        <IconPanelRight size={22} />
      </button>
    </div>
  );
}

/** Dòng phụ dưới tên: nhóm thì "[người] 25 thành viên" màu chữ chính như Zalo PC, số tin trong kho màu phụ đứng sau */
function ChatSubtitleLine({ thread }: { thread: ChatThread }) {
  const stored = `${formatNumber(thread.messageCount)} tin trong kho`;
  if (thread.threadType !== "group" || !thread.memberCount) {
    return <div className="mt-0.5 truncate text-[14px] text-ink-soft">{chatSubtitle(thread)}</div>;
  }
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[14px]">
      <IconUser size={16} className="shrink-0 text-ink" />
      <span className="shrink-0 text-ink">{formatNumber(thread.memberCount)} thành viên</span>
      <span className="truncate text-ink-soft">· {stored}</span>
    </div>
  );
}
