import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, errorText } from "../dashboard-api-client";
import { anhNen } from "../shared/background-image";
import { IconArchive } from "../shared/dashboard-icons";
import { safeNextPath } from "../shared/safe-next-path";
import { SecretInput } from "../shared/secret-input";
import { btnClass, ErrorNote, LoadingText } from "../shared/ui-bits";
import { useTheme } from "../shared/use-theme";
import { FirstPasswordSetupForm } from "./first-password-setup-form";

type Mode = "loading" | "setup" | "login";

/**
 * Cửa vào dashboard. Hỏi máy chủ đã có mật khẩu chưa: chưa có thì hiện form TẠO mật
 * khẩu lần đầu, có rồi thì form đăng nhập. Đang có phiên hợp lệ thì vào thẳng.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>("loading");
  const [gateError, setGateError] = useState("");
  const { theme } = useTheme();
  const goNext = useCallback(() => navigate(safeNextPath(params.get("next")), { replace: true }), [navigate, params]);

  const check = useCallback(() => {
    setGateError("");
    setMode("loading");
    api
      .authStatus()
      .then((s) => {
        if (s.passwordSet && s.loggedIn) goNext();
        else setMode(s.passwordSet ? "login" : "setup");
      })
      .catch((err: unknown) => setGateError(errorText(err)));
  }, [goNext]);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-canvas bg-cover bg-center px-4"
      style={{ backgroundImage: `url(${anhNen(theme)})` }}
    >
      <div className="gc-card w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zalo-500 text-white">
            <IconArchive size={28} />
          </span>
          <div className="text-[20px] font-bold tracking-tight text-ink">Kho Zalo</div>
          <div className="text-[13px] text-ink-soft">Kho lưu trữ tin nhắn tài khoản Zalo cá nhân</div>
        </div>

        {gateError ? (
          <ErrorNote message={gateError} onRetry={check} />
        ) : mode === "loading" ? (
          <LoadingText />
        ) : mode === "setup" ? (
          <FirstPasswordSetupForm onDone={goNext} />
        ) : (
          <PasswordLoginForm onDone={goNext} onNoPassword={() => setMode("setup")} />
        )}
      </div>
    </div>
  );
}

function PasswordLoginForm({ onDone, onNoPassword }: { onDone: () => void; onNoPassword: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(password);
      onDone();
    } catch (err) {
      // Mật khẩu vừa bị đặt lại (pnpm reset-password) trong lúc trang đang mở
      if (err instanceof ApiError && err.status === 409) return onNoPassword();
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="dashboard-password" className="mb-1.5 block text-[13px] font-medium text-ink">
        Mật khẩu dashboard
      </label>
      <SecretInput id="dashboard-password" value={password} onChange={setPassword} autoFocus className="mb-3" />
      {error && <p className="mb-3 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={busy || password.length === 0} className={`${btnClass("primary", "lg")} w-full`}>
        {busy ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
    </form>
  );
}
