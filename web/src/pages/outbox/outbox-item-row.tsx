import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { OutboxItem } from "../../archive-api-types";
import { IconClock, IconFileText, IconImage, IconPlay } from "../../shared/action-and-media-icons";
import { createdByLabel } from "../../shared/archive-status-labels";
import { IconChat, IconCheck, IconClose, IconWarning } from "../../shared/dashboard-icons";
import { formatClock, formatDateTime } from "../../shared/format-archive-time";
import { formatFileSize } from "../../shared/format-file-size";
import { IconPencil, IconUndo } from "../../shared/message-action-icons";
import { ThreadAvatar } from "../../shared/thread-avatar";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { btnClass } from "../../shared/ui-bits";
import { attention, modeLabel, statusLine, type StatusIcon, type StatusTone } from "./outbox-list-display";
import { OutboxMessageBubble } from "./outbox-message-bubble";

const TONE_TEXT: Record<StatusTone, string> = {
  amber: "text-amber-700 dark:text-amber-400",
  blue: "text-zalo-600 dark:text-zalo-500",
  green: "text-emerald-600 dark:text-emerald-400",
  red: "text-red-600 dark:text-red-400",
  gray: "text-ink-soft",
};
const STATUS_ICON: Record<StatusIcon, ReactNode> = {
  draft: <IconPencil size={14} />,
  clock: <IconClock size={14} />,
  check: <IconCheck size={14} />,
  error: <IconWarning size={14} />,
  recall: <IconUndo size={14} />,
  cancel: <IconClose size={14} />,
};
const ROW_BG = { warning: "bg-amber-50 dark:bg-amber-950/30", danger: "bg-red-50 dark:bg-red-950/30" };
const CHIP = "shrink-0 rounded-full bg-tile px-2 py-px text-[11.5px] text-ink-soft";
const QUIET_BTN = "inline-flex items-center gap-1 rounded px-1 text-[12.5px] text-ink-soft hover:text-ink disabled:opacity-50";

/**
 * Một tin trong Hàng đợi, gọn như một dòng danh sách Zalo: avatar, tên hội thoại + loại tin, trạng thái kèm giờ ở góc phải,
 * nội dung như bong bóng tin mình gửi, file đính kèm, một dòng phụ (ai tạo, lô, ghi chú) và nút theo trạng thái.
 */
export function OutboxItemRow(props: {
  item: OutboxItem;
  timeZone: string;
  now: Date;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
  onRecall: () => void;
}) {
  const { item, timeZone: tz, busy } = props;
  const status = statusLine(item, tz, props.now);
  const flag = attention(item);
  const threadPath = `/threads/${encodeURIComponent(item.threadId)}`;
  const recalling = !!item.recallRequestedAt && !item.recalledAt && !item.recallError;
  const canRecall = item.status === "sent" && !item.recalledAt && !recalling;
  const canCancel = item.status === "draft" || item.status === "approved";
  // Giờ tạo chỉ đáng ghi khi góc phải đang ghi giờ khác (gửi lúc / chưa gửi)
  const meta = [
    createdByLabel(item.createdBy),
    item.status === "draft" || item.status === "approved" ? `tạo ${formatClock(item.createdAt, tz)}` : null,
    // Nháp có hẹn giờ: góc phải chỉ ghi "Nháp chờ duyệt", giờ hẹn nằm ở đây (tin đã duyệt thì góc phải ghi "Gửi lúc ...")
    item.status === "draft" && item.notBefore ? `gửi từ ${formatDateTime(item.notBefore, tz)}` : null,
    item.batchId ? `${item.mode === "batch" ? "lô" : "lần chia sẻ"} ${item.batchId.slice(0, 8)}` : null,
  ].filter(Boolean);
  const avatar = {
    threadId: item.threadId,
    threadType: item.threadType,
    name: item.threadName,
    avatarUrl: item.threadAvatarUrl,
    memberAvatars: item.memberAvatars,
    memberCount: item.memberCount,
  };

  return (
    <li className={`flex gap-3 border-t border-line px-4 py-3 ${flag ? ROW_BG[flag] : ""}`}>
      <Link to={threadPath} className="shrink-0" title="Mở hội thoại" aria-label={`Mở hội thoại ${threadDisplayName(item.threadName)}`}>
        <ThreadAvatar t={avatar} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link to={threadPath} className="min-w-0 truncate text-[14.5px] font-semibold text-ink hover:text-zalo-600" title="Mở hội thoại">
            {threadDisplayName(item.threadName)}
          </Link>
          {item.threadType === "group" && <span className={CHIP}>Nhóm</span>}
          {modeLabel(item) !== "Tin lẻ" && <span className={CHIP}>{modeLabel(item)}</span>}
          <span className={`ml-auto inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium ${TONE_TEXT[status.tone]}`}>
            {STATUS_ICON[status.icon]}
            {status.text}
          </span>
        </div>

        {item.text && <OutboxMessageBubble text={item.text} />}
        {item.files.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {item.files.map((f, i) => (
              <li key={i} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[12px] text-ink">
                {f.kind === "image" ? <IconImage size={13} /> : f.kind === "video" ? <IconPlay size={13} /> : <IconFileText size={13} />}
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-ink-soft">{formatFileSize(f.size)}</span>
              </li>
            ))}
          </ul>
        )}
        {item.error && <p className="mt-1.5 text-[12.5px] text-red-700 [overflow-wrap:anywhere] dark:text-red-300">Không gửi được: {item.error}</p>}
        {item.recallError && !item.recalledAt && (
          <p className="mt-1.5 text-[12.5px] text-amber-800 [overflow-wrap:anywhere] dark:text-amber-300">Chưa thu hồi được: {item.recallError}</p>
        )}
        {item.note && <p className="mt-1 text-[12.5px] text-ink-soft [overflow-wrap:anywhere]">Ghi chú: {item.note}</p>}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 truncate text-[12px] text-ink-soft">{meta.join(" · ")}</span>
          <span className="ml-auto flex items-center gap-2">
            {canRecall && (
              <button type="button" className={QUIET_BTN} disabled={busy} onClick={props.onRecall}>
                <IconUndo size={14} /> Thu hồi
              </button>
            )}
            {item.status === "sent" && (
              <Link to={threadPath} className={QUIET_BTN}>
                <IconChat size={14} /> Mở hội thoại
              </Link>
            )}
            {canCancel && (
              <button type="button" className={btnClass("secondary", "sm")} disabled={busy} onClick={props.onCancel}>
                Hủy
              </button>
            )}
            {item.status === "draft" && (
              <button type="button" className={btnClass("primary", "sm")} disabled={busy} onClick={props.onApprove}>
                Duyệt
              </button>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}
