import { Link } from "react-router-dom";
import type { OutboxItem } from "../../archive-api-types";
import { createdByLabel, outboxStatusLabel, outboxStatusTone } from "../../shared/archive-status-labels";
import { IconPaperclip } from "../../shared/action-and-media-icons";
import { formatDateTime } from "../../shared/format-archive-time";
import { formatFileSize } from "../../shared/format-file-size";
import { ThreadKindBadge, threadDisplayName } from "../../shared/thread-kind-badge";
import { Badge, btnClass } from "../../shared/ui-bits";

export function OutboxItemCard({
  item,
  timeZone,
  busy,
  onApprove,
  onCancel,
  onRecall,
}: {
  item: OutboxItem;
  timeZone: string;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
  onRecall: () => void;
}) {
  const canApprove = item.status === "draft";
  const canCancel = item.status === "draft" || item.status === "approved";
  // Thu hồi tin đã gửi (như Zalo); đang chờ daemon thu hồi thì thôi hiện nút
  const recalling = !!item.recallRequestedAt && !item.recalledAt && !item.recallError;
  const canRecall = item.status === "sent" && !item.recalledAt && !recalling;

  return (
    <li className="gc-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/threads/${encodeURIComponent(item.threadId)}`}
          className="min-w-0 max-w-full truncate text-[15px] font-semibold text-ink hover:text-zalo-600 hover:underline"
          title="Mở hội thoại"
        >
          {threadDisplayName(item.threadName)}
        </Link>
        <ThreadKindBadge threadType={item.threadType} />
        <Badge tone={item.mode === "batch" ? "amber" : "gray"} dot={false}>
          {item.mode === "batch" ? "Gửi lô" : item.forwarded ? "Chuyển tiếp" : "Tin lẻ"}
        </Badge>
        <span className="ml-auto flex items-center gap-1.5">
          {item.recalledAt && <Badge tone="gray">Đã thu hồi</Badge>}
          {recalling && <Badge tone="amber">Đang thu hồi...</Badge>}
          <Badge tone={outboxStatusTone(item.status)}>{outboxStatusLabel(item.status)}</Badge>
        </span>
      </div>

      {/* Tin chỉ có file (không chữ) thì không có khung chữ rỗng */}
      {item.text && (
        <p className="mt-2.5 whitespace-pre-wrap rounded-lg bg-tile/50 px-3 py-2 text-[14px] leading-relaxed text-ink [overflow-wrap:anywhere]">
          {item.text}
        </p>
      )}
      {item.files.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[13px] text-ink">
          {item.files.map((f, i) => (
            <li key={i} className="flex items-center gap-1.5 [overflow-wrap:anywhere]">
              <IconPaperclip size={14} className="shrink-0 text-ink-soft" />
              {f.name} <span className="text-ink-soft">({formatFileSize(f.size)})</span>
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1 text-[12px] text-ink-soft sm:grid-cols-2">
        <div>
          <dt className="inline">Tạo: </dt>
          <dd className="inline text-ink">
            {formatDateTime(item.createdAt, timeZone)} · {createdByLabel(item.createdBy)}
          </dd>
        </div>
        {item.notBefore && (
          <div>
            <dt className="inline">Gửi từ: </dt>
            <dd className="inline text-ink">{formatDateTime(item.notBefore, timeZone)}</dd>
          </div>
        )}
        {item.finishedAt && (
          <div>
            <dt className="inline">Xong lúc: </dt>
            <dd className="inline text-ink">{formatDateTime(item.finishedAt, timeZone)}</dd>
          </div>
        )}
        {item.batchId && (
          <div className="min-w-0 truncate">
            {/* Tin lẻ có mã nhóm = một phần của lần Chia sẻ (tin chuyển tiếp + lời nhắn) */}
            <dt className="inline">{item.mode === "batch" ? "Lô: " : "Lần chia sẻ: "}</dt>
            <dd className="inline font-mono text-ink">{item.batchId}</dd>
          </div>
        )}
        {item.note && (
          <div className="sm:col-span-2">
            <dt className="inline">Ghi chú: </dt>
            <dd className="inline whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{item.note}</dd>
          </div>
        )}
      </dl>

      {item.error && (
        <p className="mt-2 break-words rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {item.error}
        </p>
      )}

      {item.recallError && !item.recalledAt && (
        <p className="mt-2 break-words rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Chưa thu hồi được: {item.recallError}
        </p>
      )}

      {(canApprove || canCancel || canRecall) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {canRecall && (
            <button type="button" className={btnClass("secondary", "sm")} disabled={busy} onClick={onRecall}>
              Thu hồi
            </button>
          )}
          {canCancel && (
            <button type="button" className={btnClass("secondary", "sm")} disabled={busy} onClick={onCancel}>
              Hủy
            </button>
          )}
          {canApprove && (
            <button type="button" className={btnClass("primary", "sm")} disabled={busy} onClick={onApprove}>
              Duyệt
            </button>
          )}
        </div>
      )}
    </li>
  );
}
