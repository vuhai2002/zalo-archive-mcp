import { useState } from "react";
import type { SessionStatus } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { PageHeader } from "../../layout/page-header";
import { IconPlay, IconQr, IconStop } from "../../shared/action-and-media-icons";
import { useConfirmDialog } from "../../shared/confirm-dialog";
import { IconLogout, IconSignal } from "../../shared/dashboard-icons";
import { formatDateTime } from "../../shared/format-archive-time";
import { SESSION_STATE_LABEL, sessionTone } from "../../shared/session-state-labels";
import { Badge, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, ErrorNote, InfoTile, LoadingText, SectionCard } from "../../shared/ui-bits";
import { ZaloQrLoginPanel } from "./zalo-qr-login-panel";

type Action = "qr" | "start" | "stop" | "logout";

export function ZaloAccountPage() {
  const { session, applySession, me } = useDashboardShell();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  async function run(action: Action, call: () => Promise<SessionStatus>) {
    setBusy(action);
    setError(null);
    try {
      applySession(await call());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function stop() {
    const ok = await confirm({
      title: "Dừng nghe tin?",
      message: "Trong lúc dừng, tin nhắn mới sẽ KHÔNG vào kho. Cookie đăng nhập vẫn giữ, bấm Chạy là nghe lại.",
      confirmLabel: "Dừng",
      tone: "normal",
    });
    if (ok) await run("stop", api.sessionStop);
  }

  async function logout() {
    const ok = await confirm({
      title: "Đăng xuất tài khoản Zalo?",
      message:
        "Dừng nghe tin và XÓA cookie đăng nhập đã lưu trên máy chủ. Muốn chạy lại phải quét QR bằng điện thoại. Tin nhắn đã lưu trong kho vẫn giữ nguyên.",
      confirmLabel: "Đăng xuất",
    });
    if (ok) await run("logout", api.sessionLogout);
  }

  if (!session) return <LoadingText />;

  const s = session;
  const needsRelogin = s.state === "gave_up" || s.state === "error";
  const canQr = s.state === "logged_out" || s.state === "stopped" || needsRelogin;
  const canStart = s.state === "stopped" || needsRelogin;
  const canStop = s.state === "running" || s.state === "logging_in";
  const canLogout = s.state !== "logged_out" && s.state !== "qr_pending";

  return (
    <div className="space-y-5">
      <PageHeader icon={IconSignal} title="Tài khoản Zalo" subtitle="Đăng nhập và trạng thái phiên nghe tin" />

      {error && <ErrorNote message={error} />}

      <SectionCard
        title="Trạng thái phiên"
        subtitle="Tự cập nhật mỗi 15 giây, mỗi 2 giây khi đang đăng nhập"
        aside={<Badge tone={sessionTone(s)}>{SESSION_STATE_LABEL[s.state]}</Badge>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoTile label="Tên hiển thị" value={s.displayName ?? "-"} />
          <InfoTile label="UID" value={<span className="font-mono text-[13px]">{s.selfUid ?? "-"}</span>} />
          <InfoTile
            label="Listener"
            value={s.listenerConnected ? "Đang kết nối" : "Không kết nối"}
            hint={s.listenerConnected ? "Tin mới đang vào kho" : "Tin mới chưa vào kho"}
          />
          <InfoTile label="Nhịp gần nhất" value={formatDateTime(s.lastHeartbeatAt, me.timeZone)} />
        </div>

        {needsRelogin && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {s.state === "gave_up"
              ? "Listener rớt kết nối liên tục nên đã ngừng thử lại - phiên đăng nhập có thể đã hết hạn (đăng xuất từ điện thoại, Zalo đá phiên...). "
              : "Đăng nhập không thành công. "}
            Hãy bấm <b>Đăng nhập bằng QR</b> và quét lại bằng điện thoại. Có thể thử <b>Chạy</b> trước nếu chỉ là lỗi mạng
            thoáng qua.
          </div>
        )}
        {s.lastError && (
          <p className="mt-3 break-words text-[12px] text-ink-soft">
            Lỗi gần nhất: <span className="font-mono text-red-600 dark:text-red-400">{s.lastError}</span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {canQr && (
            <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => run("qr", api.sessionLoginQr)}>
              <IconQr size={16} /> {busy === "qr" ? "Đang tạo mã..." : "Đăng nhập bằng QR"}
            </button>
          )}
          {canStart && (
            <button type="button" className={BTN_SECONDARY} disabled={busy !== null} onClick={() => run("start", api.sessionStart)}>
              <IconPlay size={16} /> {busy === "start" ? "Đang chạy..." : "Chạy"}
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

      {s.state === "qr_pending" && (
        <ZaloQrLoginPanel
          session={s}
          busy={busy !== null}
          // Máy chủ chỉ tạo luồng QR mới khi không còn luồng nào đang chờ: hủy luồng cũ trước
          onRegenerate={() => run("qr", async () => (await api.sessionStop(), api.sessionLoginQr()))}
          onCancel={() => run("stop", api.sessionStop)}
        />
      )}

      {confirmDialog}
    </div>
  );
}
