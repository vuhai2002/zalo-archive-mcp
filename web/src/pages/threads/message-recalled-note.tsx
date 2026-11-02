import { IconEye, IconEyeOff } from "../../shared/dashboard-icons";

/** Tin đã thu hồi như Zalo: chữ xám thay cho nội dung, nút con mắt để xem lại nội dung kho đã lưu */
export function RecalledNote({ onReveal }: { onReveal: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[14.5px] text-chat-time">
      <span>Tin nhắn đã được thu hồi</span>
      <button
        type="button"
        onClick={onReveal}
        title="Xem nội dung kho đã lưu"
        aria-label="Xem nội dung tin đã thu hồi"
        className="rounded-full p-1 text-chat-time hover:bg-black/[0.06] hover:text-chat-ink dark:hover:bg-white/10"
      >
        <IconEye size={16} />
      </button>
    </div>
  );
}

/** Đang xem nội dung tin đã thu hồi: nhãn đỏ + nút ẩn lại */
export function RecalledShownLabel({ title, onHide }: { title: string; onHide: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400" title={title}>
      Đã thu hồi
      <button type="button" onClick={onHide} title="Ẩn lại" aria-label="Ẩn nội dung tin đã thu hồi" className="rounded-full p-0.5 hover:bg-black/[0.06] dark:hover:bg-white/10">
        <IconEyeOff size={14} />
      </button>
    </span>
  );
}
