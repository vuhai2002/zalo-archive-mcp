import type { ThreadListItem } from "../../archive-api-types";
import { IconImage, IconLink, IconPaperclip, IconPlay } from "../../shared/action-and-media-icons";
import { ContactAvatar } from "../../shared/contact-avatar";
import { IconPin, IconUsers } from "../../shared/dashboard-icons";
import { MemberAvatarStack } from "../../shared/member-avatar-stack";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { previewParts, zaloListTime, type PreviewIcon } from "../../shared/zalo-list-time-and-preview";

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
  onTogglePin,
}: {
  t: ThreadListItem;
  active: boolean;
  timeZone: string;
  onSelect: (threadId: string) => void;
  onTogglePin: (t: ThreadListItem) => void;
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
    <div className={`group relative transition-colors ${active ? "bg-zalo-50 dark:bg-zalo-500/15" : "hover:bg-tile/70"}`}>
      <button
        type="button"
        onClick={() => onSelect(t.threadId)}
        aria-current={active ? "true" : undefined}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {/* Nhóm có biểu tượng người trước tên, như Zalo PC */}
              {t.threadType === "group" && <IconUsers size={15} className="shrink-0 text-ink-soft" />}
              <span className="min-w-0 truncate text-[15px] text-ink">{name}</span>
            </span>
            <span className="shrink-0 text-[12px] text-ink-soft">{zaloListTime(t.lastMessageAt, timeZone)}</span>
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1 pr-6 text-[14px] text-ink-soft">
            {preview.prefix && <span className="shrink-0">{preview.prefix}</span>}
            {preview.icon && <PreviewIconGlyph icon={preview.icon} />}
            <span className="min-w-0 truncate">{preview.text}</span>
          </span>
        </span>
      </button>
      {/* Đinh ghim ở góc dưới phải như Zalo; rê chuột thì thành nút ghim / bỏ ghim */}
      <button
        type="button"
        onClick={() => onTogglePin(t)}
        title={t.pinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại lên đầu"}
        aria-label={t.pinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại lên đầu"}
        className={`absolute bottom-2.5 right-3 rounded-md p-1 hover:bg-line ${
          t.pinned ? "text-ink-soft" : "text-ink-soft/70 opacity-0 focus:opacity-100 group-hover:opacity-100"
        }`}
      >
        <IconPin size={15} className={t.pinned ? "fill-current" : ""} />
      </button>
    </div>
  );
}

/** Biểu tượng nhỏ trước chữ xem trước, như Zalo PC: file, ảnh, video, link */
function PreviewIconGlyph({ icon }: { icon: PreviewIcon }) {
  const Glyph = { file: IconPaperclip, image: IconImage, video: IconPlay, link: IconLink }[icon];
  return <Glyph size={14} className="shrink-0" />;
}
