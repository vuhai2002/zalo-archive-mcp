import { useEffect, useState } from "react";
import type { PollView } from "../../archive-api-types";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { useChotNen } from "../../shared/backdrop-close-guard";
import { IconChevronDown, IconClose } from "../../shared/dashboard-icons";
import { formatDateTime } from "../../shared/format-archive-time";
import { Badge, ErrorNote, LoadingText } from "../../shared/ui-bits";
import { PollOptionsList } from "./poll-options-list";
import { usePollView } from "./use-poll-view";

/** Dòng trạng thái chung cho thẻ và cửa sổ: chưa lấy được chi tiết / lấy hỏng */
export function PollStatusNote({ view }: { view: PollView }) {
  if (view.status === "pending") return <p className="text-[13px] text-ink-soft">Đang chờ lấy kết quả bình chọn từ Zalo...</p>;
  if (view.status === "error") return <p className="text-[13px] text-red-600 dark:text-red-400">Không lấy được kết quả từ Zalo: {view.error}</p>;
  return null;
}

/**
 * Cửa sổ "Bình chọn" như Zalo PC nhưng CHỈ XEM: câu hỏi, người tạo, chọn nhiều phương án, số người / lượt bình chọn, các phương
 * án với số phiếu + avatar người chọn, dấu tích phương án mình đã chọn. Không có Thêm lựa chọn / Xác nhận - bình chọn trên Zalo.
 */
export function PollDetailDialog({ pollId, onClose }: { pollId: string; onClose: () => void }) {
  const tz = useArchiveTimeZone();
  const { view, error } = usePollView(pollId);
  const [showNames, setShowNames] = useState(false);
  const nen = useChotNen(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" {...nen} role="dialog" aria-modal="true" aria-label="Bình chọn">
      <div className="flex max-h-[88dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <header className="flex items-center border-b border-line px-5 py-3">
          <h2 className="flex-1 text-[17px] font-semibold text-ink">Bình chọn</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-1.5 text-ink-soft hover:bg-tile hover:text-ink">
            <IconClose size={22} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {error && <ErrorNote message={error} />}
          {!view && !error && <LoadingText />}
          {view && (
            <>
              <h3 className="text-[18px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{view.question}</h3>
              {view.creator && (
                <p className="text-[13px] text-ink-soft">
                  Tạo bởi {view.creator.isSelf ? "Bạn" : (view.creator.name ?? "thành viên")}
                  {view.createdAt ? ` - ${formatDateTime(view.createdAt, tz)}` : ""}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
                {view.allowMultiChoices && <span>Chọn nhiều phương án</span>}
                {view.isAnonymous && <span>Ẩn danh</span>}
                {view.expiresAt && <span>Hết hạn {formatDateTime(view.expiresAt, tz)}</span>}
                {view.closed && <Badge tone="gray">Đã khóa</Badge>}
              </div>
              <PollStatusNote view={view} />
              {view.status !== "pending" && view.options.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowNames((v) => !v)}
                    disabled={view.isAnonymous}
                    className="flex items-center gap-1 text-[13.5px] font-medium text-zalo-600 hover:underline disabled:no-underline dark:text-zalo-500"
                  >
                    {view.voterCount} người bình chọn, {view.voteCount} lượt bình chọn
                    {!view.isAnonymous && <IconChevronDown size={16} className={showNames ? "rotate-180" : "-rotate-90"} />}
                  </button>
                  <PollOptionsList view={view} variant="dialog" showNames={showNames} />
                </>
              )}
            </>
          )}
        </div>
        <footer className="border-t border-line px-5 py-2.5 text-[12px] text-ink-soft">
          Chỉ xem trong kho - bình chọn trên Zalo.
          {view?.fetchedAt ? ` Kết quả cập nhật lúc ${formatDateTime(view.fetchedAt, tz)}.` : ""}
        </footer>
      </div>
    </div>
  );
}
