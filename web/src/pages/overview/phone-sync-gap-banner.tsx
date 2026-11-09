import { useEffect, useState } from "react";
import type { PhoneSyncSuggestionInfo } from "../../archive-api-types";
import { api } from "../../dashboard-api-client";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { phoneSyncGapText } from "../zalo-account/phone-sync-gap-notice";

/**
 * Trang Tổng quan: nhắc quãng có thể thiếu tin sau khi nick đăng nhập lại bằng QR, mở Cài đặt > Đồng bộ và sao lưu
 * để đồng bộ từ điện thoại (nút đồng bộ đúng quãng đó nằm ở thẻ "Lịch sử cũ từ điện thoại").
 */
export function PhoneSyncGapBanner({ timeZone }: { timeZone: string }) {
  const { openSettings } = useDashboardShell();
  const [suggestion, setSuggestion] = useState<PhoneSyncSuggestionInfo | null>(null);
  useEffect(() => {
    api
      .mobileSync()
      .then((r) => setSuggestion(r.suggestion))
      .catch(() => setSuggestion(null));
  }, []);
  if (!suggestion) return null;
  return (
    <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <span className="font-semibold">Có thể thiếu tin</span> - {phoneSyncGapText(suggestion, timeZone)}{" "}
      <button type="button" onClick={() => openSettings("sync")} className="font-medium underline underline-offset-2">
        Đồng bộ từ điện thoại để lấy lại
      </button>
    </div>
  );
}
