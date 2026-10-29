import type { QrStatus, SessionStatus } from "../../archive-api-types";
import { IconRefresh } from "../../shared/action-and-media-icons";
import { BTN_PRIMARY, BTN_SECONDARY } from "../../shared/ui-bits";

const QR_STATUS_TEXT: Record<QrStatus, string> = {
  waiting_scan: "Mở app Zalo trên điện thoại, chọn quét mã QR và quét mã này.",
  scanned: "Đã quét - bấm xác nhận đăng nhập trên điện thoại.",
  expired: "Mã QR đã hết hạn. Bấm \"Tạo mã mới\" để lấy mã khác.",
  declined: "Bạn đã từ chối đăng nhập trên điện thoại.",
};

/** Base64 PNG hợp lệ thì mới ghép vào data URI - chuỗi lạ thì coi như chưa có ảnh */
const BASE64 = /^[A-Za-z0-9+/=\s]+$/;

/** Khung mã QR khi phiên đang ở `qr_pending`; trạng thái tự cập nhật nhờ vòng hỏi 2 giây ở shell */
export function ZaloQrLoginPanel({
  session,
  busy,
  onRegenerate,
  onCancel,
}: {
  session: SessionStatus;
  busy: boolean;
  onRegenerate: () => void;
  onCancel: () => void;
}) {
  const image = session.qrImageBase64 && BASE64.test(session.qrImageBase64) ? session.qrImageBase64 : null;
  const status = session.qrStatus;
  const canRegenerate = status === "expired" || status === "declined";

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-tile/40 p-5 text-center sm:flex-row sm:items-start sm:text-left">
      <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-xl border border-line bg-white p-2">
        {image && status !== "expired" ? (
          <img src={`data:image/png;base64,${image}`} alt="Mã QR đăng nhập Zalo" className="h-full w-full object-contain" />
        ) : (
          <span className="animate-pulse text-[13px] text-slate-500">
            {status === "expired" ? "Mã đã hết hạn" : "Đang tạo mã QR..."}
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-3">
        <div className="text-[15px] font-semibold text-ink">Đăng nhập bằng mã QR</div>
        <p className="text-[14px] leading-relaxed text-ink-soft">
          {status ? QR_STATUS_TEXT[status] : "Đang chờ máy chủ tạo mã QR..."}
        </p>
        <p className="text-[12px] leading-relaxed text-ink-soft/80">
          Dùng đúng tài khoản Zalo cá nhân muốn lưu trữ. Không chạy tài khoản này đồng thời ở chương trình khác
          (vd zalo-agent) - mỗi tài khoản chỉ được một nơi nghe tin.
        </p>
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          {canRegenerate && (
            <button type="button" onClick={onRegenerate} disabled={busy} className={BTN_PRIMARY}>
              <IconRefresh size={16} /> Tạo mã mới
            </button>
          )}
          <button type="button" onClick={onCancel} disabled={busy} className={BTN_SECONDARY}>
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
