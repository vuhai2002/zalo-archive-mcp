import { useEffect, useState } from "react";
import type { ThreadMember, ThreadMessagesResponse } from "../../archive-api-types";
import { api } from "../../dashboard-api-client";
import { ContactAvatar } from "../../shared/contact-avatar";
import { threadDisplayName } from "../../shared/thread-kind-badge";

/** Zalo PC hiện 7 avatar thành viên + ô "+N" (4 mỗi hàng) */
const SHOWN = 7;

/**
 * Thẻ đầu hội thoại nhóm như Zalo PC, hiện khi đã cuộn tới tin đầu tiên trong kho: tên nhóm, lưới avatar thành viên (7 người
 * + "+N"). Ngày của tin đầu nằm ngay ở vạch giờ bên dưới. Thành viên lấy từ danh sách thành viên của kho (người nhóm Zalo
 * trả về); chưa lấy được thì chỉ hiện tên nhóm.
 */
export function ThreadStartCard({ thread }: { thread: ThreadMessagesResponse["thread"] }) {
  const [members, setMembers] = useState<{ list: ThreadMember[]; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .threadMembers(thread.threadId, { limit: SHOWN, offset: 0 })
      .then((r) => !cancelled && setMembers({ list: r.members, total: r.total }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [thread.threadId]);

  const total = thread.memberCount ?? members?.total ?? 0;
  const more = members ? total - members.list.length : 0;
  return (
    <div className="mb-2 mt-4 flex flex-col items-center">
      <h2 className="max-w-[85%] truncate text-[24px] font-semibold text-chat-ink">{threadDisplayName(thread.name)}</h2>
      {members && members.list.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-x-4 gap-y-3">
          {members.list.map((m) => (
            <span key={m.userId} title={m.isSelf ? "Bạn" : (m.name ?? m.userId)} className="rounded-full ring-2 ring-white dark:ring-white/10">
              <ContactAvatar name={m.name ?? "?"} seed={m.userId} url={m.avatarUrl} size="intro" />
            </span>
          ))}
          {more > 0 && (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bubble text-[20px] text-chat-time ring-2 ring-white dark:ring-white/10">
              +{more}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
