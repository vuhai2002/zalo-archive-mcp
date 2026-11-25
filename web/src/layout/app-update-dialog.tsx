import { useEffect, useState } from "react";
import type { UpdateInfo } from "../archive-api-types";
import { api } from "../dashboard-api-client";
import { useChotNen } from "../shared/backdrop-close-guard";
import { IconClose } from "../shared/dashboard-icons";
import { APP_UPDATE_AGENT_PROMPT, APP_UPDATE_POLL_MS } from "./app-update-agent-prompt";
import { IconArrowRightThin, IconArrowUpCircle, IconCheckSmall, IconCopy, IconGithubMark } from "./app-update-icons";
import { ReleaseNotesView } from "./release-notes-view";

export { IconArrowUpCircle } from "./app-update-icons";

/**
 * Có bản mới trên GitHub Release: thanh bên hiện nút, bấm mở hộp này với prompt soạn sẵn để chép đưa agent tự cập nhật
 * (ai dùng kho cũng đã cắm nó vào agent). Không tự cập nhật gì.
 */

/** Hỏi /api/version lúc mở dashboard rồi định kỳ; lỗi thì coi như không có bản mới */
export function useAppUpdateInfo(): UpdateInfo | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    const load = () => api.version().then(setInfo, () => undefined);
    load();
    const t = setInterval(load, APP_UPDATE_POLL_MS);
    return () => clearInterval(t);
  }, []);
  return info?.updateAvailable ? info : null;
}

const STEPS = ["Sao chép prompt bên dưới", "Dán vào Claude Code (hoặc agent bạn đang dùng)", "Agent tự cập nhật rồi báo lại cho bạn"];

export function AppUpdateDialog({ info, onClose }: { info: UpdateInfo; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const nen = useChotNen(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(APP_UPDATE_AGENT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Trình duyệt chặn clipboard: người dùng tự bôi đen ô prompt để chép
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" {...nen} role="dialog" aria-modal="true" aria-label={`Có bản mới v${info.latest}`}>
      <div className="max-h-[90dvh] w-full max-w-[540px] overflow-y-auto rounded-2xl bg-surface shadow-2xl">
        {/* Dải đầu xanh Zalo: bản đang chạy -> bản mới */}
        <div className="relative rounded-t-2xl bg-gradient-to-br from-[#0068ff] to-[#0047b3] px-6 pb-5 pt-6 text-white">
          <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-3 top-3 rounded-full p-1.5 text-white/80 hover:bg-white/15 hover:text-white">
            <IconClose size={18} />
          </button>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <IconArrowUpCircle size={24} />
            </span>
            <div>
              <div className="text-[18px] font-semibold leading-tight">Đã có bản mới</div>
              <div className="text-[13px] text-white/80">Zalo Archive MCP</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[13px] font-medium">
            <span className="rounded-full bg-white/15 px-3 py-1 text-white/85">v{info.current}</span>
            <IconArrowRightThin size={16} className="text-white/70" />
            <span className="rounded-full bg-emerald-400 px-3 py-1 font-semibold text-emerald-950">v{info.latest}</span>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <ol className="space-y-2">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-[13.5px] text-ink">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zalo-500/10 text-[12px] font-semibold text-zalo-600 dark:bg-zalo-500/30 dark:text-white">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>

          {/* Ô prompt kiểu khối code, nút chép ngay trong ô */}
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line bg-tile/60 px-3.5 py-2">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft">Prompt cho agent</span>
              <button
                type="button"
                onClick={() => void copy()}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium ${copied ? "text-emerald-600 dark:text-emerald-400" : "text-ink-soft hover:bg-line hover:text-ink"}`}
              >
                {copied ? <IconCheckSmall size={15} /> : <IconCopy size={15} />}
                {copied ? "Đã chép" : "Chép"}
              </button>
            </div>
            <p className="select-all whitespace-pre-wrap px-3.5 py-3 text-[13.5px] leading-relaxed text-ink">{APP_UPDATE_AGENT_PROMPT}</p>
          </div>

          {info.notes && (
            <div>
              <div className="mb-2 text-[13.5px] font-semibold text-ink">Có gì mới trong v{info.latest}</div>
              <div className="max-h-44 overflow-y-auto rounded-xl bg-tile/50 px-4 py-3">
                <ReleaseNotesView notes={info.notes} />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
          <button type="button" onClick={() => void copy()} className="flex items-center gap-2 rounded-lg bg-zalo-500 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-zalo-600">
            {copied ? <IconCheckSmall size={17} /> : <IconCopy size={17} />}
            {copied ? "Đã chép prompt" : "Sao chép prompt"}
          </button>
          {info.releaseUrl && (
            <a
              href={info.releaseUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-2 rounded-lg bg-[#24292f] px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-[#32383f] dark:bg-[#f0f6fc] dark:text-[#24292f] dark:hover:bg-white"
            >
              <IconGithubMark size={17} />
              Xem trên GitHub
            </a>
          )}
          <button type="button" onClick={onClose} className="ml-auto rounded-lg px-3 py-2.5 text-[14px] font-medium text-ink-soft hover:bg-tile">
            Để sau
          </button>
        </div>
        <p className="-mt-1 px-6 pb-4 text-[12px] text-ink-soft">Muốn tự làm tay: xem mục "Cập nhật" trong README của repo.</p>
      </div>
    </div>
  );
}
