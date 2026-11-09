import { IconReply } from "../../shared/action-and-media-icons";

/**
 * Nút "Trả lời" hiện cạnh bong bóng khi rê chuột vào tin, như Zalo PC: bấm thì khung soạn mang ô trích dẫn tin này.
 * Cha phải có lớp `group` để nút chỉ hiện khi rê vào đúng tin; bấm Tab tới nút thì nút cũng hiện.
 */
export function MessageReplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Trả lời"
      aria-label="Trả lời tin này"
      className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full bg-surface text-ink-soft opacity-0 shadow-sm transition-opacity hover:text-zalo-500 focus-visible:opacity-100 group-hover:opacity-100"
    >
      <IconReply size={15} />
    </button>
  );
}
