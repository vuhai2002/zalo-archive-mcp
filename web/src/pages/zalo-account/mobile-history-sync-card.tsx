import { useCallback, useEffect, useState } from "react";
import type { MobileSyncResponse, MobileSyncStage } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { PhoneSyncGapNotice } from "./phone-sync-gap-notice";
import type { ConfirmOptions } from "../../shared/confirm-dialog";
import { BTN_PRIMARY, BTN_SECONDARY, ErrorNote, SectionCard } from "../../shared/ui-bits";

const RUNNING: MobileSyncStage[] = ["requesting", "waiting_confirm", "waiting_backup", "mobile_idle", "downloading", "decrypting", "resolving_ids", "importing"];
const WITH_PROGRESS: MobileSyncStage[] = ["downloading", "decrypting", "importing"];
const inputClass = "rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink";

/**
 * Lấy lịch sử tin CŨ (trước khi kho chạy) bằng tính năng "Đồng bộ tin nhắn từ điện thoại" của
 * Zalo: bấm nút -> điện thoại hỏi xác nhận -> điện thoại gửi bản sao lưu -> kho nhập. Tin đã có
 * không bị nhập trùng. Trong lúc chạy, thẻ tự hỏi trạng thái mỗi 2 giây.
 */
export function MobileHistorySyncCard({ confirm }: { confirm: (o: ConfirmOptions) => Promise<boolean> }) {
  const timeZone = useArchiveTimeZone();
  const [data, setData] = useState<MobileSyncResponse | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stage = data?.status?.stage ?? null;
  const running = stage !== null && RUNNING.includes(stage);

  const load = useCallback(() => {
    api.mobileSync().then(setData).catch((err: unknown) => setError(errorText(err)));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 2_000);
    return () => clearInterval(t);
  }, [running, load]);

  /** `range`: đồng bộ đúng quãng có thể thiếu tin (lời nhắc); không có thì theo hai ô ngày */
  async function start(range?: { fromDate: string; toDate: string }) {
    if (range) {
      setFromDate(range.fromDate);
      setToDate(range.toDate);
    }
    const from = range?.fromDate ?? fromDate;
    const to = range?.toDate ?? toDate;
    const ok = await confirm({
      title: "Đồng bộ lịch sử từ điện thoại?",
      message:
        'Zalo trên điện thoại sẽ hỏi "Đồng bộ tin nhắn sang máy tính" - bấm Đồng ý, rồi giữ Zalo mở trên điện thoại tới khi xong. ' +
        "Tin đã có trong kho không bị nhập trùng. Ảnh / file của tin cũ có thể đã hết hạn trên máy chủ Zalo.",
      confirmLabel: "Bắt đầu",
      tone: "normal",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      setData(await api.mobileSyncStart({ fromDate: from || undefined, toDate: to || undefined }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function dismissSuggestion() {
    try {
      setData(await api.mobileSyncDismissSuggestion());
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      setData(await api.mobileSyncCancel());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const s = data?.status;
  return (
    <SectionCard title="Lịch sử cũ từ điện thoại" subtitle="Lấy tin nhắn từ trước khi kho chạy, qua tính năng đồng bộ của Zalo">
      {error && <ErrorNote message={error} />}
      {!data?.available && <p className="mb-3 text-[13px] text-ink-soft">Nick cần đang chạy (đã đăng nhập và nghe tin) mới đồng bộ được.</p>}
      {data?.suggestion && !running && (
        <PhoneSyncGapNotice
          suggestion={data.suggestion}
          timeZone={timeZone}
          disabled={busy || !data.available}
          onSync={() => void start({ fromDate: data.suggestion!.fromDate, toDate: data.suggestion!.toDate })}
          onDismiss={() => void dismissSuggestion()}
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
          Từ ngày
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} disabled={running} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
          Đến ngày
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} disabled={running} className={inputClass} />
        </label>
        {running ? (
          <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={cancel}>
            Hủy đồng bộ
          </button>
        ) : (
          <button type="button" className={BTN_PRIMARY} disabled={busy || !data?.available} onClick={() => void start()}>
            {busy ? "Đang gửi yêu cầu..." : "Đồng bộ từ điện thoại"}
          </button>
        )}
      </div>
      <p className="mt-2 text-[12px] text-ink-soft">Bỏ trống hai ô ngày = lấy toàn bộ lịch sử trên điện thoại.</p>

      {s && (
        <div className="mt-4 rounded-xl border border-line bg-tile/40 px-4 py-3 text-[13.5px]">
          <div className={s.stage === "failed" ? "text-red-600 dark:text-red-400" : "text-ink"}>{s.message}</div>
          {WITH_PROGRESS.includes(s.stage) && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-zalo-500 transition-all" style={{ width: `${s.progress}%` }} />
            </div>
          )}
          {s.stats && (
            <div className="mt-2 text-[12px] text-ink-soft">
              {s.stats.messagesRead} tin đọc được · {s.stats.messagesImported} tin mới · {s.stats.messagesSkipped} đã có / bỏ qua
              {s.stats.messagesOutOfRange ? ` · ${s.stats.messagesOutOfRange} ngoài khoảng ngày` : ""}
              {s.stats.conversationsUnresolved ? ` · ${s.stats.conversationsUnresolved} hội thoại không ghép được` : ""}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
