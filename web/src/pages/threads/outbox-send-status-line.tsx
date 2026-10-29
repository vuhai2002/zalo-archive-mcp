import { Link } from "react-router-dom";
import type { OutboxItem } from "../../archive-api-types";
import { formatDateTime } from "../../shared/format-archive-time";

/** Dòng kết quả dưới ô soạn tin: đang gửi / đã gửi / lỗi / đã lưu nháp / đã hẹn giờ */
export function OutboxSendStatusLine({
  item,
  timedOut,
  timeZone,
  onDismiss,
}: {
  item: OutboxItem;
  timedOut: boolean;
  timeZone: string;
  onDismiss: () => void;
}) {
  let tone = "text-ink-soft";
  let text: string;
  switch (item.status) {
    case "draft":
      text = `Đã lưu nháp #${item.id} - bấm Duyệt ở Hàng đợi để gửi.`;
      break;
    case "approved":
      if (item.notBefore && new Date(item.notBefore).getTime() > Date.now() + 60_000) {
        text = `Đã hẹn gửi lúc ${formatDateTime(item.notBefore, timeZone)}.`;
      } else {
        text = timedOut ? "Tin vẫn đang chờ gửi sau 60 giây - xem kết quả ở Hàng đợi." : "Đang chờ gửi...";
      }
      break;
    case "sending":
      text = timedOut ? "Tin vẫn đang gửi sau 60 giây - xem kết quả ở Hàng đợi." : "Đang gửi...";
      tone = "text-amber-600 dark:text-amber-400";
      break;
    case "sent":
      text = `Đã gửi lúc ${formatDateTime(item.finishedAt, timeZone)}.`;
      tone = "text-emerald-600 dark:text-emerald-400";
      break;
    case "failed":
    case "rejected":
      text = `${item.status === "failed" ? "Gửi lỗi" : "Bị từ chối"}: ${item.error ?? "không rõ lý do"}`;
      tone = "text-red-600 dark:text-red-400";
      break;
    case "cancelled":
      text = "Tin đã bị hủy.";
      break;
    default:
      text = item.status;
  }

  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <p className={`min-w-0 break-words ${tone}`}>
        {text}{" "}
        {(item.status === "draft" || timedOut || item.status === "approved") && (
          <Link to="/outbox" className="font-medium text-zalo-600 underline-offset-2 hover:underline">
            Mở Hàng đợi
          </Link>
        )}
      </p>
      <button type="button" onClick={onDismiss} className="shrink-0 text-ink-soft hover:text-ink">
        Ẩn
      </button>
    </div>
  );
}
