import { useCallback, useEffect, useState } from "react";
import type { ZaloPcMediaImportStatus } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import type { ConfirmOptions } from "../../shared/confirm-dialog";
import { formatDateTime } from "../../shared/format-archive-time";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { BTN_PRIMARY, ErrorNote, SectionCard } from "../../shared/ui-bits";
import { ZaloPcReceivedFilesDirField } from "./zalo-pc-received-files-dir-field";

/**
 * Ảnh / video / file / tin thoại Zalo đã xóa khỏi máy chủ (tin cũ, thường từ đồng bộ điện thoại) nhưng Zalo PC trên
 * máy này đã tải về: kho tìm trong thư mục tải về của Zalo PC rồi chép sang, ghép vào đúng tin. CHỈ ĐỌC thư mục Zalo PC,
 * không sửa gì.
 * Trong lúc chạy, thẻ tự hỏi trạng thái mỗi 2 giây.
 */
export function ZaloPcMediaImportCard({ confirm }: { confirm: (o: ConfirmOptions) => Promise<boolean> }) {
  const tz = useArchiveTimeZone();
  const [data, setData] = useState<ZaloPcMediaImportStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = data?.running ?? false;

  const load = useCallback(() => {
    api.zaloPcMedia().then(setData).catch((err: unknown) => setError(errorText(err)));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 2_000);
    return () => clearInterval(t);
  }, [running, load]);

  async function start() {
    const ok = await confirm({
      title: "Lấy file từ Zalo PC?",
      message:
        "Kho tìm bản Zalo PC đã tải về máy này cho các file không tải được (Zalo đã xóa khỏi máy chủ) rồi chép sang kho. " +
        "Chỉ đọc thư mục của Zalo PC, không sửa hay xóa gì. Chạy nền, có thể mất vài phút.",
      confirmLabel: "Bắt đầu",
      tone: "normal",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      setData(await api.zaloPcMediaStart());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const p = data?.progress;
  const percent = p && p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;
  return (
    <SectionCard title="Ảnh / video / file cũ từ Zalo PC" subtitle="Lấy lại file Zalo đã xóa khỏi máy chủ từ bản Zalo PC đã tải về máy này">
      {error && <ErrorNote message={error} />}
      {data && !data.available && (
        <p className="mb-3 text-[13px] text-ink-soft">
          Không thấy thư mục tải về của Zalo PC cho nick này trên máy{data.downloadsDir ? ` (${data.downloadsDir})` : ""}.
        </p>
      )}
      <button type="button" className={BTN_PRIMARY} disabled={busy || running || !data?.available} onClick={start}>
        {running ? "Đang lấy..." : busy ? "Đang bắt đầu..." : "Lấy từ Zalo PC"}
      </button>
      <p className="mt-2 text-[12px] text-ink-soft">
        Chỉ đọc thư mục của Zalo PC, không sửa gì. File Zalo PC chưa từng tải (hội thoại chưa mở trên máy tính lúc file còn trên máy
        chủ) thì không lấy được.
      </p>

      {(running || p || data?.error) && (
        <div className="mt-4 rounded-xl border border-line bg-tile/40 px-4 py-3 text-[13.5px]">
          {data?.error ? (
            <div className="text-red-600 dark:text-red-400">{data.error}</div>
          ) : (
            <div className="text-ink">
              {running ? `Đang xét ${p?.processed ?? 0} / ${p?.total ?? "?"} file...` : `Xong lúc ${formatDateTime(data?.finishedAt, tz)}`}
            </div>
          )}
          {running && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-zalo-500 transition-all" style={{ width: `${percent}%` }} />
            </div>
          )}
          {p && (
            <div className="mt-2 text-[12px] text-ink-soft">
              {p.recovered} file lấy lại được · {p.notFound} Zalo PC không có
              {p.rejected ? ` · ${p.rejected} bản không khớp (bỏ qua)` : ""}
              {p.failed ? ` · ${p.failed} lỗi khi chép` : ""}
            </div>
          )}
        </div>
      )}
      {data && <ZaloPcReceivedFilesDirField data={data} disabled={running} onSaved={setData} />}
    </SectionCard>
  );
}
