import type { SessionStatus } from "../../archive-api-types";
import { api } from "../../dashboard-api-client";
import { IconPlay, IconQr, IconStop } from "../../shared/action-and-media-icons";
import type { ConfirmOptions } from "../../shared/confirm-dialog";
import { ContactAvatar } from "../../shared/contact-avatar";
import { IconLogout } from "../../shared/dashboard-icons";
import { formatDateTime } from "../../shared/format-archive-time";
import { listenerRetryText, SESSION_STATE_LABEL, sessionTone } from "../../shared/session-state-labels";
import { Badge, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, InfoTile, SectionCard } from "../../shared/ui-bits";

export type SessionAction = "qr" | "start" | "stop" | "logout" | "reconnect";

/** Thẻ "Nick đang dùng": ai, đang nghe tin không, và các nút Chạy / Dừng / Đăng xuất / quét lại QR */
export function ZaloSessionStatusCard({
  session: s,
  busy,
  timeZone,
  onRun,
  confirm,
}: {
  session: SessionStatus;
  busy: string | null;
  timeZone: string;
  onRun: (action: SessionAction, call: () => Promise<SessionStatus>) => Promise<void>;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
}) {
  const name = s.account?.displayName ?? s.displayName ?? s.account?.id ?? "?";
  const needsRelogin = s.state === "gave_up" || s.state === "error";
  const canQr = s.state === "logged_out" || needsRelogin;
  const canStart = (s.state === "stopped" || needsRelogin) && s.account?.hasCredentials === true;
  const canStop = s.state === "running" || s.state === "logging_in";
  const canLogout = s.account?.hasCredentials === true && s.state !== "qr_pending";
  // Zalo vừa đóng kết nối, kho đang chờ tự nối lại: nói rõ, không cần đăng nhập lại
  const waiting = listenerRetryText(s, timeZone);

  async function stop() {
    const ok = await confirm({
      title: "Dừng nghe tin?",
      message: "Trong lúc dừng, tin nhắn mới chưa vào kho (bấm Chạy lại thì Zalo gửi bù được khoảng 2 tuần gần nhất). Cookie vẫn giữ.",
      confirmLabel: "Dừng",
      tone: "normal",
    });
    if (ok) await onRun("stop", api.sessionStop);
  }

  async function logout() {
    const ok = await confirm({
      title: `Đăng xuất ${name}?`,
      message:
        "Dừng nghe tin và XÓA cookie đăng nhập của nick này trên máy chủ. Muốn chạy lại phải quét QR. Tin nhắn đã lưu trong kho vẫn giữ nguyên.",
      confirmLabel: "Đăng xuất",
    });
    if (ok) await onRun("logout", api.sessionLogout);
  }

  return (
    <SectionCard
      title="Nick đang dùng"
      subtitle="Tự cập nhật mỗi 15 giây, mỗi 2 giây khi đang đăng nhập"
      aside={<Badge tone={sessionTone(s)}>{SESSION_STATE_LABEL[s.state]}</Badge>}
    >
      <div className="mb-4 flex items-center gap-3">
        <ContactAvatar name={name} seed={s.account?.uid ?? s.account?.id ?? "nick"} url={s.account?.avatarUrl} size="lg" />
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold text-ink">{name}</div>
          <div className="truncate font-mono text-[12px] text-ink-soft">{s.selfUid ?? s.account?.uid ?? s.account?.id}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InfoTile
          label="Listener"
          value={s.listenerConnected ? "Đang kết nối" : "Không kết nối"}
          hint={
            s.listenerConnected
              ? "Tin mới đang vào kho"
              : s.listenerRetryAt
                ? `Tự nối lại lúc ${formatDateTime(s.listenerRetryAt, timeZone)}`
                : "Tin mới chưa vào kho"
          }
        />
        <InfoTile label="Nhịp gần nhất" value={formatDateTime(s.lastHeartbeatAt, timeZone)} />
      </div>

      {waiting && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {waiting}. Không cần đăng nhập lại - thường gặp lúc vừa mở máy (Zalo PC khởi động cùng lúc) hoặc khi có phiên Zalo Web
          khác. Muốn nhanh thì bấm <b>Nối lại ngay</b>; tin trong lúc mất kết nối được Zalo gửi bù khi nối lại.
        </div>
      )}
      {needsRelogin && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {s.state === "gave_up"
            ? "Listener rớt kết nối liên tục nên đã ngừng thử lại - phiên đăng nhập có thể đã hết hạn (đăng xuất từ điện thoại, Zalo đá phiên...). "
            : "Đăng nhập không thành công. "}
          Hãy bấm <b>Đăng nhập lại bằng QR</b> và quét bằng điện thoại. Có thể thử <b>Chạy</b> trước nếu chỉ là lỗi mạng thoáng qua.
        </div>
      )}
      {s.lastError && (
        <p className="mt-3 break-words text-[12px] text-ink-soft">
          Lỗi gần nhất: <span className="font-mono text-red-600 dark:text-red-400">{s.lastError}</span>
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {canQr && (
          <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => onRun("qr", api.sessionLoginQr)}>
            <IconQr size={16} /> {busy === "qr" ? "Đang tạo mã..." : needsRelogin ? "Đăng nhập lại bằng QR" : "Đăng nhập bằng QR"}
          </button>
        )}
        {canStart && (
          <button type="button" className={BTN_SECONDARY} disabled={busy !== null} onClick={() => onRun("start", api.sessionStart)}>
            <IconPlay size={16} /> {busy === "start" ? "Đang chạy..." : "Chạy"}
          </button>
        )}
        {waiting && (
          <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => onRun("reconnect", api.sessionReconnect)}>
            <IconPlay size={16} /> {busy === "reconnect" ? "Đang nối lại..." : "Nối lại ngay"}
          </button>
        )}
        {canStop && (
          <button type="button" className={BTN_SECONDARY} disabled={busy !== null} onClick={stop}>
            <IconStop size={16} /> {busy === "stop" ? "Đang dừng..." : "Dừng"}
          </button>
        )}
        {canLogout && (
          <button type="button" className={BTN_DANGER} disabled={busy !== null} onClick={logout}>
            <IconLogout size={16} /> {busy === "logout" ? "Đang đăng xuất..." : "Đăng xuất"}
          </button>
        )}
      </div>
      {s.state === "stopped" && (
        <p className="mt-3 text-[12px] text-ink-soft">
          Đã có cookie đăng nhập: bấm <b>Chạy</b> để nghe tin lại mà không cần quét QR.
        </p>
      )}
    </SectionCard>
  );
}
