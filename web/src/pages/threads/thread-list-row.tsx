import type { ThreadListItem } from "../../archive-api-types";
import { IconPaperclip } from "../../shared/action-and-media-icons";
import { ContactAvatar } from "../../shared/contact-avatar";
import { MemberAvatarStack } from "../../shared/member-avatar-stack";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { previewParts, zaloListTime } from "../../shared/zalo-list-time-and-preview";

/**
 * Một dòng hội thoại kiểu Zalo: avatar (nhóm không có ảnh thì ghép avatar thành
 * viên), tên, giờ tương đối, và dòng xem trước tin cuối ("Bạn: 📎 file.mp4").
 * Không có nhãn nhóm/bạn bè - nhìn avatar và dòng tin là đủ hiểu.
 */
export function ThreadListRow({
  t,
  active,
  timeZone,
  onSelect,
}: {
  t: ThreadListItem;
  active: boolean;
  timeZone: string;
  onSelect: (threadId: string) => void;
}) {
  const name = threadDisplayName(t.name);
  const preview = previewParts(t.lastMessage, t.threadType);
  const avatar =
    t.threadType === "group" && !t.avatarUrl && t.memberAvatars.length > 0 ? (
      <MemberAvatarStack members={t.memberAvatars} memberCount={t.memberCount} seed={t.threadId} />
    ) : (
      <ContactAvatar name={name} seed={t.threadId} url={t.avatarUrl} size="lg" />
    );

  return (
    <button
      type="button"
      onClick={() => onSelect(t.threadId)}
      aria-current={active ? "true" : undefined}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
        active ? "bg-zalo-50 dark:bg-zalo-500/15" : "hover:bg-tile/70"
      }`}
    >
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{name}</span>
          <span className="shrink-0 text-[12px] text-ink-soft">{zaloListTime(t.lastMessageAt, timeZone)}</span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[13.5px] text-ink-soft">
          {preview.prefix && <span className="shrink-0">{preview.prefix}</span>}
          {preview.icon === "file" && <IconPaperclip size={14} className="shrink-0" />}
          <span className="min-w-0 truncate">{preview.text}</span>
        </span>
      </span>
    </button>
  );
}
