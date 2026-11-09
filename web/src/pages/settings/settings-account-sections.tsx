import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { useConfirmDialog } from "../../shared/confirm-dialog";
import { MobileHistorySyncCard } from "../zalo-account/mobile-history-sync-card";
import { ZaloAccountPanel } from "../zalo-account/zalo-account-panel";
import { ZaloPcMediaImportCard } from "../zalo-account/zalo-pc-media-import-card";

/** Cài đặt > Tài khoản Zalo (trước là trang riêng): nick đang dùng, đăng nhập QR, đổi nick, Chỉ đọc */
export function AccountSection() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionTitle title="Tài khoản Zalo" hint="Đăng nhập, đổi nick và trạng thái nghe tin" />
      <ZaloAccountPanel />
    </div>
  );
}

/** Cài đặt > Đồng bộ và sao lưu (như "Đồng bộ tin nhắn" của Zalo PC): lịch sử cũ từ điện thoại, media từ Zalo PC trên máy */
export function SyncSection() {
  const { session } = useDashboardShell();
  const { confirm, confirmDialog } = useConfirmDialog();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionTitle title="Đồng bộ và sao lưu" hint="Lấy tin cũ từ điện thoại và ảnh, video, file từ Zalo PC về kho" />
      {session?.account ? (
        <>
          <MobileHistorySyncCard confirm={confirm} />
          <ZaloPcMediaImportCard confirm={confirm} />
        </>
      ) : (
        <p className="text-[14px] text-ink-soft">Chưa có nick Zalo nào. Đăng nhập ở mục Tài khoản Zalo trước.</p>
      )}
      {confirmDialog}
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-[18px] font-semibold text-ink">{title}</h2>
      <p className="text-[13.5px] text-ink-soft">{hint}</p>
    </div>
  );
}
