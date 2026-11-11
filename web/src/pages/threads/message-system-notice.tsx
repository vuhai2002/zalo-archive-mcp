import type { ArchivedMessage } from "../../archive-api-types";
import { MemberAvatarStack } from "../../shared/member-avatar-stack";
import { RichMessageText } from "./rich-message-text";

/**
 * Thông báo giữa khung chat như Zalo: viên bo tròn, avatar của người được nhắc tới đứng trước, tên in đậm màu chữ chính
 * ("Bạn, Huân Lục, Vỹ Khang được Trác Khuê thêm vào nhóm", "X vừa yêu cầu tham gia nhóm."). Nhiều người thì avatar ghép
 * như Zalo PC: 2 người xếp chéo, 3 người tam giác, đông hơn thì 3 avatar + ô tổng số ("9"). Thông báo kết bạn
 * (`chat.ecard`) không có avatar, tên thì vẫn hiện như câu thường.
 */
export function MessageSystemNotice({ msg, title }: { msg: ArchivedMessage; title: string }) {
  const members = (msg.noticeAvatars ?? []).map((a, i) => ({ userId: a.userId ?? `${msg.msgId}-${i}`, name: a.name, avatarUrl: a.url }));
  return (
    <div className="my-3 flex justify-center" title={title}>
      <div className="flex max-w-[85%] items-center gap-1.5 rounded-full bg-bubble px-3 py-1 text-[12.5px] text-chat-time shadow-sm [&_.font-semibold]:text-chat-ink">
        {members.length > 0 && <MemberAvatarStack members={members} memberCount={msg.noticePeople ?? null} seed={msg.msgId} size="tiny" />}
        <div className="min-w-0 text-center">
          <RichMessageText text={msg.text} styles={msg.textStyles} />
        </div>
      </div>
    </div>
  );
}
