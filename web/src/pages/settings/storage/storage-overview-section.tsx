import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { StorageOverviewResponse } from "../../../archive-api-types";
import { api, errorText } from "../../../dashboard-api-client";
import { useArchiveTimeZone } from "../../../layout/dashboard-shell-context";
import { IconDatabase, IconFileText, IconImage } from "../../../shared/action-and-media-icons";
import { useConfirmDialog } from "../../../shared/confirm-dialog";
import { IconChevronDown } from "../../../shared/dashboard-icons";
import { formatDateTime } from "../../../shared/format-archive-time";
import { formatFileSize } from "../../../shared/format-file-size";
import { ErrorNote, LoadingText } from "../../../shared/ui-bits";
import { useSettingsView } from "../settings-view-context";
import { archiveTotalBytes, driveBarParts, driveLabel } from "./storage-display-rules";
import { StorageFileTile } from "./storage-file-tile";

const POLL_MS = 2_000;

/**
 * Quản lý dữ liệu - màn chính, như Zalo PC: tổng dung lượng kho, thanh ổ đĩa (kho / ứng dụng khác / trống), các thẻ: file theo
 * hội thoại, file lớn hơn 5 MB (xem trước), tin nhắn (DB), bản sao cũ + nhật ký. Dung lượng ổ đo ở nền: đang đo thì hỏi lại.
 */
export function StorageOverviewSection() {
  const tz = useArchiveTimeZone();
  const { go } = useSettingsView();
  const [data, setData] = useState<StorageOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  const load = useCallback((refresh = false) => {
    api.storage(refresh).then(setData, (err: unknown) => setError(errorText(err)));
  }, []);
  useEffect(() => load(), [load]);
  // Đang đo ổ ở nền: hỏi lại tới khi xong
  useEffect(() => {
    if (!data?.computing) return;
    const t = setTimeout(() => load(), POLL_MS);
    return () => clearTimeout(t);
  }, [data, load]);

  async function deleteBackup(name: string, bytes: number) {
    const ok = await confirm({
      title: "Xóa bản sao DB cũ?",
      message: `Xóa hẳn ${name} (${formatFileSize(bytes)}). Đây là bản sao kho lưu lại trước các lần sửa lớn; kho đang dùng không bị ảnh hưởng. Không khôi phục được.`,
      confirmLabel: "Xóa bản sao",
    });
    if (!ok) return;
    api.storageDeleteBackups([name]).then(setData, (err: unknown) => setError(errorText(err)));
  }

  if (error) return <ErrorNote message={error} onRetry={() => (setError(null), load())} />;
  if (!data) return <LoadingText />;
  const disk = data.disk;
  const bar = disk ? driveBarParts(disk) : null;
  const mediaBytes = data.byKind.reduce((s, k) => s + k.bytes, 0);
  const mediaFiles = data.byKind.reduce((s, k) => s + k.files, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-[18px] font-semibold text-ink">Dữ liệu kho</h2>
        <div className="mt-2 text-[34px] font-bold leading-tight text-zalo-600 dark:text-zalo-500">{disk ? formatFileSize(archiveTotalBytes(disk)) : "Đang đo..."}</div>
      </div>

      <div>
        <div className="text-[13px] text-ink-soft">Vị trí lưu trữ</div>
        <div className="text-[15px] font-medium text-ink" title={data.location}>
          {driveLabel(data.location)}
        </div>
        {bar && disk && (
          <>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div className="bg-zalo-500" style={{ width: `${bar.archive}%` }} />
              <div className="bg-sky-400" style={{ width: `${bar.other}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink">
              <Legend color="bg-zalo-500">Kho Zalo</Legend>
              <Legend color="bg-sky-400">Ứng dụng khác</Legend>
              <span className="ml-auto text-ink-soft">{formatFileSize(disk.drive.freeBytes)} trống</span>
            </div>
          </>
        )}
      </div>

      <Card
        onOpen={() => go({ section: "data", page: "threads" })}
        icon={<IconImage size={22} />}
        title="Ảnh, video, file theo hội thoại"
        hint={`${mediaFiles.toLocaleString("vi-VN")} file đã tải. Xem dung lượng từng hội thoại, chọn để xóa file - tin nhắn vẫn giữ.`}
        size={formatFileSize(mediaBytes)}
      />
      <Card onOpen={() => go({ section: "data", page: "files", big: true })} icon={<IconFileText size={22} />} title="Ảnh, video, file lớn hơn 5 MB" hint={`${data.bigFiles.files.toLocaleString("vi-VN")} file`} size={formatFileSize(data.bigFiles.bytes)}>
        {data.bigFiles.preview.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-1.5 sm:w-[420px]">
            {data.bigFiles.preview.map((f) => (
              <StorageFileTile key={f.id} file={f} compact />
            ))}
          </div>
        )}
      </Card>
      <Card icon={<IconDatabase size={22} />} title="Tin nhắn" hint="Chữ, cảm xúc và thông tin file của mọi tin. Cần để kho chạy, không xóa ở đây." size={disk ? formatFileSize(disk.databaseBytes) : "..."} />

      {disk && (disk.backups.length > 0 || disk.journalBytes > 0) && (
        <div className="rounded-xl bg-surface p-4 shadow-sm">
          <div className="text-[15px] font-medium text-ink">Bản sao cũ và nhật ký</div>
          <div className="mt-1 text-[13px] text-ink-soft">Nhật ký tin thô (để phát lại khi cần): {formatFileSize(disk.journalBytes)}</div>
          <ul className="mt-2 divide-y divide-line">
            {disk.backups.map((b) => (
              <li key={b.name} className="flex items-center gap-3 py-2 text-[14px]">
                <span className="min-w-0 flex-1 truncate text-ink" title={b.name}>
                  {b.name} <span className="text-ink-soft">- {formatDateTime(b.modifiedAt, tz)}</span>
                </span>
                <span className="shrink-0 tabular-nums text-ink">{formatFileSize(b.bytes)}</span>
                <button type="button" onClick={() => void deleteBackup(b.name, b.bytes)} className="shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">
                  Xóa
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[13px] text-ink-soft">
        {data.computing ? "Đang đo lại dung lượng trên ổ..." : disk ? `Cập nhật lần cuối lúc ${formatDateTime(disk.computedAt, tz)}. ` : ""}
        {!data.computing && (
          <button type="button" onClick={() => load(true)} className="font-medium text-zalo-600 hover:underline dark:text-zalo-500">
            Làm mới
          </button>
        )}
      </p>
      {confirmDialog}
    </div>
  );
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${color}`} />
      {children}
    </span>
  );
}

/** Thẻ một loại dữ liệu như Zalo PC; có `onOpen` thì bấm vào được (mũi tên) */
function Card({ onOpen, icon, title, hint, size, children }: { onOpen?: () => void; icon: ReactNode; title: string; hint: string; size: string; children?: ReactNode }) {
  const body = (
    <div className="flex items-start gap-4">
      <span className="mt-0.5 shrink-0 text-ink-soft">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium text-ink">{title}</div>
        <div className="mt-0.5 text-[13px] leading-snug text-ink-soft">{hint}</div>
        {children}
      </div>
      <span className="shrink-0 text-[16px] font-medium tabular-nums text-ink">{size}</span>
      {onOpen && <IconChevronDown size={18} className="mt-0.5 shrink-0 -rotate-90 text-ink-soft" />}
    </div>
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} className="block w-full rounded-xl bg-surface p-4 text-left shadow-sm hover:bg-tile/60">
      {body}
    </button>
  ) : (
    <div className="rounded-xl bg-surface p-4 shadow-sm">{body}</div>
  );
}
