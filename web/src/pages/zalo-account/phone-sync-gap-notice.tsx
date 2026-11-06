import type { PhoneSyncSuggestionInfo } from "../../archive-api-types";
import { formatDateTime } from "../../shared/format-archive-time";
import { BTN_PRIMARY, BTN_SECONDARY } from "../../shared/ui-bits";

/** Câu nhắc: quãng nào có thể thiếu tin và vì sao (dùng chung cho thẻ đồng bộ và trang Tổng quan) */
export function phoneSyncGapText(s: PhoneSyncSuggestionInfo, timeZone: string): string {
  return (
    `Nick vừa đăng nhập lại bằng mã QR sau một lúc không nghe tin. Zalo không gửi bù tin cho phiên đăng nhập mới, ` +
    `nên tin từ ${formatDateTime(s.fromIso, timeZone)} tới ${formatDateTime(s.toIso, timeZone)} có thể thiếu.`
  );
}

/**
 * Lời nhắc trong thẻ "Lịch sử cũ từ điện thoại": đồng bộ đúng quãng có thể thiếu tin (ngày điền sẵn), hoặc bỏ qua.
 * Đồng bộ xong phủ được quãng đó thì máy chủ tự thôi nhắc.
 */
export function PhoneSyncGapNotice({
  suggestion,
  timeZone,
  disabled,
  onSync,
  onDismiss,
}: {
  suggestion: PhoneSyncSuggestionInfo;
  timeZone: string;
  disabled: boolean;
  onSync: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p>{phoneSyncGapText(suggestion, timeZone)} Đồng bộ từ điện thoại quãng này để lấy lại.</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={disabled} onClick={onSync}>
          Đồng bộ quãng này
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={onDismiss}>
          Bỏ qua
        </button>
      </div>
    </div>
  );
}
