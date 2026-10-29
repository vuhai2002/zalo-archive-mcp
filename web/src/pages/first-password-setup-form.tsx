import { useState, type FormEvent } from "react";
import { api, errorText } from "../dashboard-api-client";
import { SecretInput } from "../shared/secret-input";
import { btnClass } from "../shared/ui-bits";

const MIN_LENGTH = 8;

/**
 * Lần đầu mở dashboard: tạo mật khẩu + nhập lại. Máy chủ chỉ nhận khi CHƯA có mật
 * khẩu nào (tạo đè bị từ chối), lưu dạng băm. Tạo xong là đăng nhập luôn.
 */
export function FirstPasswordSetupForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const length = [...password.normalize("NFC")].length;
  const tooShort = password.length > 0 && length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = !busy && length >= MIN_LENGTH && confirm === password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await api.setupPassword(password, confirm);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="mb-4 rounded-xl bg-zalo-50 px-3.5 py-3 text-[13px] leading-relaxed text-ink dark:bg-zalo-500/15">
        Lần đầu sử dụng: tạo mật khẩu để mở kho tin nhắn. Mật khẩu chỉ lưu trên máy này, ở dạng đã mã hóa.
      </p>

      <label htmlFor="new-password" className="mb-1.5 block text-[13px] font-medium text-ink">
        Mật khẩu mới
      </label>
      <SecretInput id="new-password" value={password} onChange={setPassword} autoFocus className="mb-1" />
      <p className={`mb-3 text-[12px] ${tooShort ? "text-red-600 dark:text-red-400" : "text-ink-soft"}`}>
        Ít nhất {MIN_LENGTH} ký tự{tooShort ? ` (đang có ${length})` : ""}
      </p>

      <label htmlFor="confirm-password" className="mb-1.5 block text-[13px] font-medium text-ink">
        Nhập lại mật khẩu
      </label>
      <SecretInput id="confirm-password" value={confirm} onChange={setConfirm} className="mb-1" />
      <p className="mb-3 min-h-[18px] text-[12px] text-red-600 dark:text-red-400">{mismatch ? "Hai lần nhập chưa khớp" : ""}</p>

      {error && <p className="mb-3 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={!canSubmit} className={`${btnClass("primary", "lg")} w-full`}>
        {busy ? "Đang tạo..." : "Tạo mật khẩu"}
      </button>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-ink-soft">
        Quên mật khẩu thì chạy lệnh <code className="font-mono">pnpm reset-password</code> trên máy này để tạo lại.
      </p>
    </form>
  );
}
