import type { ArchivedMessage } from "../../archive-api-types";
import { ContactAvatar } from "../../shared/contact-avatar";
import { RichMessageText } from "./rich-message-text";

/**
 * Thông báo giữa khung chat như Zalo: viên bo tròn, avatar nhỏ của người được nhắc tới đứng trước,
 * tên in đậm màu chữ chính ("Quế Khuê được Mẫn Khuê thêm vào nhóm", "X vừa yêu cầu tham gia
 * nhóm."). Thông báo kết bạn (`chat.ecard`) không có avatar, tên thì vẫn hiện như câu thường.
 */
export function MessageSystemNotice({ msg, title }: { msg: ArchivedMessage; title: string }) {
  const avatar = msg.noticeAvatar;
  return (
    <div className="my-3 flex justify-center" title={title}>
      <div className="flex max-w-[85%] items-center gap-1.5 rounded-full bg-bubble px-3 py-1 text-[12.5px] text-chat-time shadow-sm [&_.font-semibold]:text-chat-ink">
        {avatar && <ContactAvatar name={avatar.name ?? "?"} seed={avatar.userId ?? msg.msgId} url={avatar.url} size="2xs" />}
        <div className="min-w-0 text-center">
          <RichMessageText text={msg.text} styles={msg.textStyles} />
        </div>
      </div>
    </div>
  );
}
