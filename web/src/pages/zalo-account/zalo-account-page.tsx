import { useCallback, useEffect, useState } from "react";
import type { AccountSummary, SessionStatus } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { PageHeader } from "../../layout/page-header";
import { IconQr } from "../../shared/action-and-media-icons";
import { useConfirmDialog } from "../../shared/confirm-dialog";
import { IconSignal } from "../../shared/dashboard-icons";
import { BTN_PRIMARY, ErrorNote, SectionCard } from "../../shared/ui-bits";
import { MobileHistorySyncCard } from "./mobile-history-sync-card";
import { ZaloPcMediaImportCard } from "./zalo-pc-media-import-card";
import { nickLabel, ZaloNickListCard } from "./zalo-nick-list-card";
import { ZaloQrLoginPanel } from "./zalo-qr-login-panel";
import { ZaloSessionStatusCard, type SessionAction } from "./zalo-session-status-card";

type Action = SessionAction | "switch";

export function ZaloAccountPage() {
  const { session, applySession, me } = useDashboardShell();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  const loadAccounts = useCallback(() => {
    api
      .accounts()
      .then((r) => setAccounts(r.accounts))
      .catch((err: unknown) => setError(errorText(err)));
  }, []);
  // Tải lại danh sách khi nick đang dùng hoặc trạng thái đổi (vừa quét QR xong, vừa đăng xuất...)
  useEffect(loadAccounts, [loadAccounts, session?.account?.id, session?.state]);

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

  async function addNick() {
    if (session?.state === "running" || session?.state === "logging_in") {
      const ok = await confirm({
        title: "Thêm nick khác?",
        message:
          "Nick đang dùng sẽ dừng nghe tin trong lúc quét QR (cookie vẫn giữ, chuyển lại không cần quét). Quét nick nào thì kho chuyển sang nick đó.",
        confirmLabel: "Tạo mã QR",
        tone: "normal",
      });
      if (!ok) return;
    }
    await run("qr", api.sessionLoginQr);
  }

  async function switchTo(target: AccountSummary) {
    const current = accounts?.find((a) => a.active);
    const ok = await confirm({
      title: `Chuyển sang ${nickLabel(target)}?`,
      message:
        `${current ? `Nick ${nickLabel(current)} sẽ dừng nghe tin, dữ liệu vẫn giữ nguyên. ` : ""}` +
        "Khi quay lại một nick, tin đến trong lúc nick đó không chạy chỉ lấy bù được khoảng 2 tuần gần nhất." +
        (target.hasCredentials ? "" : " Nick này cần quét QR lại sau khi chuyển."),
      confirmLabel: "Chuyển",
      tone: "normal",
    });
    if (ok) await run("switch", () => api.activateAccount(target.id));
  }

  async function toggleReadOnly(target: AccountSummary) {
    if (target.readOnly) {
      const ok = await confirm({
        title: `Mở gửi tin cho ${nickLabel(target)}?`,
        message:
          "Sau khi mở, Claude (qua MCP) và dashboard gửi được tin thay nick này. Chỉ mở với nick của chính bạn - nick mượn hay nick đang thử thì để Chỉ đọc.",
        confirmLabel: "Mở gửi tin",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy("switch");
    setError(null);
    try {
      setAccounts((await api.setAccountReadOnly(target.id, !target.readOnly)).accounts);
      applySession(await api.session());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  if (!session) return null;
  const qrPending = session.state === "qr_pending";

  return (
    <div className="space-y-5">
      <PageHeader icon={IconSignal} title="Tài khoản Zalo" subtitle="Đăng nhập, đổi nick và trạng thái nghe tin" />

      {error && <ErrorNote message={error} />}

      {session.account ? (
        <ZaloSessionStatusCard session={session} busy={busy} timeZone={me.timeZone} onRun={run} confirm={confirm} />
      ) : (
        !qrPending && (
          <SectionCard title="Chưa có nick Zalo nào" subtitle="Đăng nhập một lần bằng QR, sau đó kho tự chạy mỗi khi mở máy chủ">
            <p className="mb-4 text-[14px] leading-relaxed text-ink-soft">
              Bấm nút dưới, mở app Zalo trên điện thoại, chọn quét mã QR và quét mã hiện ra. Nên thử trên nick phụ trước.
            </p>
            <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => run("qr", api.sessionLoginQr)}>
              <IconQr size={16} /> {busy === "qr" ? "Đang tạo mã..." : "Đăng nhập bằng QR"}
            </button>
          </SectionCard>
        )
      )}

      {qrPending && (
        <ZaloQrLoginPanel
          session={session}
          busy={busy !== null}
          // Máy chủ chỉ tạo luồng QR mới khi không còn luồng nào đang chờ: hủy luồng cũ trước
          onRegenerate={() => run("qr", async () => (await api.sessionStop(), api.sessionLoginQr()))}
          onCancel={() => run("stop", api.sessionStop)}
        />
      )}

      {(accounts?.length ?? 0) > 0 && (
        <ZaloNickListCard
          accounts={accounts}
          busy={busy !== null || qrPending}
          canAdd={!qrPending}
          timeZone={me.timeZone}
          onSwitch={switchTo}
          onAdd={addNick}
          onToggleReadOnly={toggleReadOnly}
        />
      )}

      {session.account && <MobileHistorySyncCard confirm={confirm} />}
      {session.account && <ZaloPcMediaImportCard confirm={confirm} />}

      {confirmDialog}
    </div>
  );
}
