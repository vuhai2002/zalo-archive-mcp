import type { ArchivedMessage } from "../../archive-api-types";
import { IconReply } from "../../shared/action-and-media-icons";
import { IconClose } from "../../shared/dashboard-icons";

/** Nhãn của tin không có chữ, như ô trích dẫn Zalo */
const KIND_LABEL: Record<string, string> = {
  photo: "[Hình ảnh]",
  video: "[Video]",
  gif: "[GIF]",
  sticker: "[Sticker]",
  voice: "[Tin nhắn thoại]",
};

/** Một dòng tóm tắt tin được trả lời: chữ gộp một dòng; không chữ thì nhãn loại tin / tên file */
export function replyTargetText(msg: ArchivedMessage): string {
  const text = (msg.link?.title ?? msg.text).replace(/\s+/g, " ").trim();
  if (text) return msg.link ? `[Link] ${text}` : text;
  const att = msg.attachments[0];
  if (!att) return "Tin nhắn";
  return att.kind === "file" ? `[File] ${att.fileName ?? ""}`.trim() : (KIND_LABEL[att.kind] ?? "Tin nhắn");
}

/**
 * Dải "Trả lời <tên>" phía trên ô nhập, như Zalo: cho biết tin sắp gửi sẽ trích dẫn tin nào; bấm X để bỏ trả lời.
 */
export function ComposerReplyStrip({ target, onCancel }: { target: ArchivedMessage; onCancel: () => void }) {
  // Như ô trích dẫn: tên thật cả khi trả lời tin của chính mình, chỉ không biết tên mới ghi "Bạn"
  const name = target.senderName?.trim() || (target.isSelf ? "Bạn" : target.senderId);
  return (
    <div className="mx-3 mt-2 flex items-start gap-2 rounded-md border-l-2 border-zalo-500 bg-tile px-2.5 py-1.5 text-[12.5px]">
      <IconReply size={16} className="mt-0.5 shrink-0 text-zalo-500" />
      <div className="min-w-0 flex-1">
        <div className="text-ink">
          Trả lời <span className="font-semibold">{name}</span>
        </div>
        <div className="truncate text-ink-soft">{replyTargetText(target)}</div>
      </div>
      <button type="button" onClick={onCancel} title="Bỏ trả lời" aria-label="Bỏ trả lời" className="rounded p-0.5 text-ink-soft hover:bg-black/5 hover:text-ink dark:hover:bg-white/10">
        <IconClose size={16} />
      </button>
    </div>
  );
}
