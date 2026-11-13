import { IconSend } from "../../shared/action-and-media-icons";

/** Nút gửi 30x30 bo 3px (cỡ nút bên phải khung soạn của Zalo Web): cạnh dòng chữ, hay cuối thanh định dạng khi bật định dạng */
export function ComposerSendButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Gửi ngay (Enter) - Shift+Enter để xuống dòng"
      aria-label="Gửi ngay"
      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[3px] text-zalo-500 hover:bg-[#e5e7eb] disabled:text-ink-soft/50 disabled:hover:bg-transparent dark:hover:bg-tile"
    >
      <IconSend size={20} />
    </button>
  );
}
