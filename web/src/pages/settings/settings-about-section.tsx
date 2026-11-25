import { useEffect, useState, type ReactNode } from "react";
import type { AppAbout, UpdateInfo } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { AppUpdateDialog } from "../../layout/app-update-dialog";
import { IconArrowUpCircle, IconCircleCheck, IconGithubMark, IconInfoCircle, IconRefreshArrows } from "../../layout/app-update-icons";
import { checkForUpdateNow, useAppUpdateState } from "../../layout/app-update-store";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { formatDateTime } from "../../shared/format-archive-time";

/**
 * Cài đặt > Giới thiệu: phiên bản đang chạy, nút "Kiểm tra cập nhật" (hỏi GitHub ngay), kết quả (bản mới nhất / có bản mới
 * - bấm ra hộp prompt cho agent / chưa kiểm tra được), link mã nguồn, changelog, giấy phép, tác giả (đọc từ package.json).
 */
export function AboutSection() {
  const tz = useArchiveTimeZone();
  const info = useAppUpdateState();
  const [about, setAbout] = useState<AppAbout | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  useEffect(() => {
    api.about().then(setAbout, () => undefined);
  }, []);

  async function checkNow() {
    setChecking(true);
    setError(null);
    try {
      await checkForUpdateNow();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setChecking(false);
    }
  }

  const repo = about?.repoUrl;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h2 className="text-[18px] font-semibold text-ink">Giới thiệu</h2>
      <div className="rounded-xl bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <img src="/app-logo.png" alt="" className="h-14 w-14 rounded-2xl" />
          <div>
            <div className="text-[17px] font-semibold text-ink">Zalo Archive MCP</div>
            <div className="text-[13.5px] text-ink-soft">
              Phiên bản <span className="font-semibold text-ink">{about?.version ?? info?.current ?? "..."}</span>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <UpdateStatus info={info} checking={checking} tz={tz} onCheck={() => void checkNow()} onShow={() => setShowUpdate(true)} />
          {error && <p className="mt-2 text-[12.5px] text-red-600 dark:text-red-400">Chưa kiểm tra được: {error}</p>}
        </div>

        {repo && (
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-[13.5px]">
            <LinkItem href={repo} icon={<IconGithubMark size={16} />}>Mã nguồn trên GitHub</LinkItem>
            <LinkItem href={`${repo}/blob/main/docs/project-changelog.md`}>Có gì mới (changelog)</LinkItem>
            <LinkItem href={`${repo}/blob/main/LICENSE`}>Giấy phép MIT</LinkItem>
          </div>
        )}
        {about?.authorName && (
          <p className="mt-3 text-[13.5px] text-ink-soft">
            Tác giả:{" "}
            {about.authorUrl ? (
              <a href={about.authorUrl} target="_blank" rel="noreferrer noopener" className="font-medium text-zalo-500 hover:underline">
                {about.authorName}
              </a>
            ) : (
              <span className="font-medium text-ink">{about.authorName}</span>
            )}
          </p>
        )}
      </div>
      {showUpdate && info?.updateAvailable && <AppUpdateDialog info={info} onClose={() => setShowUpdate(false)} />}
    </div>
  );
}

function UpdateStatus(p: { info: UpdateInfo | null; checking: boolean; tz: string; onCheck: () => void; onShow: () => void }) {
  const { info } = p;
  const when = info?.checkedAt ? `Kiểm tra lúc ${formatDateTime(info.checkedAt, p.tz)}` : null;
  const checkButton = (
    <button
      type="button"
      onClick={p.onCheck}
      disabled={p.checking || info?.enabled === false}
      className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13.5px] font-medium text-ink hover:bg-tile disabled:opacity-60"
    >
      <IconRefreshArrows size={16} className={p.checking ? "animate-spin" : ""} />
      {p.checking ? "Đang kiểm tra..." : "Kiểm tra cập nhật"}
    </button>
  );
  if (info?.updateAvailable && !p.checking) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-zalo-200 bg-zalo-50 px-4 py-3 dark:border-zalo-500/40 dark:bg-zalo-500/15">
        <IconArrowUpCircle size={22} className="shrink-0 text-zalo-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-zalo-600 dark:text-zalo-200">Có bản mới v{info.latest}</div>
          <div className="text-[12.5px] text-zalo-600/80 dark:text-zalo-200/80">Lấy prompt để agent tự cập nhật{when ? ` · ${when}` : ""}</div>
        </div>
        <button type="button" onClick={p.onShow} className="shrink-0 rounded-lg bg-zalo-500 px-3.5 py-2 text-[13.5px] font-semibold text-white hover:bg-zalo-600">
          Xem cách cập nhật
        </button>
      </div>
    );
  }
  const [icon, title, hint] = p.checking
    ? [<IconRefreshArrows key="i" size={22} className="shrink-0 animate-spin text-zalo-500" />, "Đang kiểm tra trên GitHub...", null]
    : info?.enabled === false
      ? [<IconInfoCircle key="i" size={22} className="shrink-0 text-ink-soft" />, "Kiểm tra bản mới đang tắt", "Bật lại bằng UPDATE_CHECK_ENABLED=true"]
      : info?.latest
        ? [<IconCircleCheck key="i" size={22} className="shrink-0 text-emerald-600 dark:text-emerald-400" />, "Bạn đang dùng bản mới nhất", when]
        : [<IconInfoCircle key="i" size={22} className="shrink-0 text-ink-soft" />, "Chưa kiểm tra được bản mới", when ?? "Bấm Kiểm tra cập nhật để thử lại"];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-ink">{title}</div>
        {hint && <div className="text-[12.5px] text-ink-soft">{hint}</div>}
      </div>
      {checkButton}
    </div>
  );
}

function LinkItem({ href, icon, children }: { href: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-ink-soft hover:text-zalo-500">
      {icon}
      {children}
    </a>
  );
}
