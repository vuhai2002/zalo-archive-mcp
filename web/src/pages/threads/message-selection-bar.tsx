import { IconTrash } from "../../shared/message-action-icons";

/** Thanh thay khung soạn khi đang Chọn nhiều tin nhắn: đếm số tin đã chọn, Xóa khỏi kho, Hủy */
export function MessageSelectionBar({ count, onDelete, onCancel }: { count: number; onDelete: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 border-t border-line bg-surface px-4 py-3">
      <span className="text-[14px] text-ink">
        Đã chọn <b className="tabular-nums">{count}</b> tin nhắn
      </span>
      <button
        type="button"
        onClick={onDelete}
        disabled={count === 0}
        className="ml-auto flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-[14px] font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600"
      >
        <IconTrash size={16} /> Xóa khỏi kho
      </button>
      <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3 py-2 text-[14px] font-medium text-ink-soft hover:bg-tile">
        Hủy
      </button>
    </div>
  );
}
