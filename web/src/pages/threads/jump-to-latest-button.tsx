import { IconChevronsDown } from "../../shared/dashboard-icons";

/**
 * Nút tròn ở góc dưới vùng tin nhắn, ngay trên ô soạn (như Zalo): hiện khi đã kéo lên đọc tin cũ hoặc đang xem
 * đoạn cũ vừa nhảy tới (`showJumpToLatest`); bấm để về tin mới nhất.
 */
export function JumpToLatestButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Tin mới nhất"
      aria-label="Tin mới nhất"
      className="absolute bottom-4 right-6 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink-soft shadow-md hover:bg-tile hover:text-zalo-500"
    >
      <IconChevronsDown size={20} />
    </button>
  );
}
