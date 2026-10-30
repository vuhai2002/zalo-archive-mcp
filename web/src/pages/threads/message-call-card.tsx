import { iconBase, type IconProps } from "../../shared/dashboard-icons";

/** Màu tiêu đề cuộc gọi bị nhỡ, gần màu đỏ Zalo dùng */
const MISSED_CALL_COLOR = "#e5484d";

const IconPhone = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <path d="M5 4h3l1.5 4-2 1.3a11 11 0 0 0 7.2 7.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4Z" />
  </svg>
);

const IconVideoCall = (p: IconProps) => (
  <svg {...iconBase(p)}>
    <rect x="3" y="6.5" width="12.5" height="11" rx="2" />
    <path d="M15.5 10.5l5-3v9l-5-3" />
  </svg>
);

/**
 * Thẻ cuộc gọi như Zalo PC: dòng đầu tiêu đề ("Bạn bị nhỡ" tô đỏ, "Cuộc gọi đi"...), dòng hai biểu
 * tượng điện thoại / máy quay + loại cuộc gọi hoặc thời lượng. Kho chỉ lưu nên không có nút "Gọi lại".
 * `text` là câu máy chủ đã dựng sẵn: "tiêu đề\nchi tiết".
 */
export function MessageCallCard({ text, missed }: { text: string; missed: boolean }) {
  const [title = "", detail = ""] = text.split("\n");
  const video = /video/i.test(text);
  const Icon = video ? IconVideoCall : IconPhone;
  return (
    <div className="min-w-[190px]">
      <div className="text-[15px] font-semibold" style={missed ? { color: MISSED_CALL_COLOR } : undefined}>
        {title}
      </div>
      {detail && (
        <div className="mt-1 flex items-center gap-2 text-[14px] text-chat-time">
          <Icon size={16} className="shrink-0" style={missed ? { color: MISSED_CALL_COLOR } : undefined} />
          {detail}
        </div>
      )}
    </div>
  );
}
