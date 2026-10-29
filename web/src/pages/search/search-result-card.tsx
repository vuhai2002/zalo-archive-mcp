import { Link } from "react-router-dom";
import type { SearchResult, ThreadSummary } from "../../archive-api-types";
import { formatDateTime } from "../../shared/format-archive-time";
import { highlightMatches } from "../../shared/highlight-search-match";
import { ThreadKindBadge, threadDisplayName } from "../../shared/thread-kind-badge";
import { Badge } from "../../shared/ui-bits";

/** Một kết quả tìm kiếm: hội thoại (link mở), người gửi, giờ, đoạn chữ có tô từ khóa */
export function SearchResultCard({
  msg,
  thread,
  query,
  timeZone,
}: {
  msg: SearchResult;
  /** Thông tin hội thoại nếu đã có trong danh sách đã tải - kết quả tìm không kèm tên hội thoại */
  thread: ThreadSummary | undefined;
  query: string;
  timeZone: string;
}) {
  const sender = msg.isSelf ? "Tôi" : msg.senderName?.trim() || msg.senderId;
  return (
    <li className="gc-card p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          to={`/threads/${encodeURIComponent(msg.threadId)}`}
          className="min-w-0 max-w-full truncate text-[14px] font-semibold text-zalo-600 hover:underline"
          title="Mở hội thoại"
        >
          {threadDisplayName(thread?.name ?? msg.threadName)}
        </Link>
        <ThreadKindBadge threadType={msg.threadType} isFriend={thread?.isFriend ?? msg.threadIsFriend} />
        <span className="ml-auto text-[12px] tabular-nums text-ink-soft">{formatDateTime(msg.sentAt, timeZone)}</span>
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-soft">{sender}</div>
      <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink [overflow-wrap:anywhere]">
        {highlightMatches(msg.text, query)}
      </p>
      {(msg.attachments.length > 0 || msg.recalledAt) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {msg.attachments.length > 0 && (
            <Badge tone="gray" dot={false}>
              {msg.attachments.length} file đính kèm
            </Badge>
          )}
          {msg.recalledAt && <Badge tone="red">Đã thu hồi</Badge>}
        </div>
      )}
    </li>
  );
}
