import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { OutboxItem, OutboxListResponse } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { IconRefresh } from "../../shared/action-and-media-icons";
import { useConfirmDialog, type ConfirmOptions } from "../../shared/confirm-dialog";
import { IconInbox } from "../../shared/dashboard-icons";
import { KillSwitchBanner } from "../../shared/kill-switch-banner";
import { formatDateTime } from "../../shared/format-archive-time";
import { EmptyState, ErrorNote, LoadingText } from "../../shared/ui-bits";
import { OutboxItemRow } from "./outbox-item-row";
import { groupByDay, OUTBOX_TABS, tabCount } from "./outbox-list-display";

const LIMIT = 100;
const REFRESH_MS = 10_000;

/**
 * Hàng đợi gửi: một cột giữa (tối đa 760px, màn rộng mấy cũng không giãn), tab gạch chân như Zalo (Nháp / Lỗi có số
 * đếm), tin xếp mới nhất trước và chia theo ngày. Tự hỏi lại mỗi 10 giây.
 */
export function OutboxPage() {
  const tz = useArchiveTimeZone();
  const [params, setParams] = useSearchParams();
  const tab = OUTBOX_TABS.find((t) => t.key === params.get("tab")) ?? OUTBOX_TABS[0]!;
  const [items, setItems] = useState<OutboxItem[] | null>(null);
  const [counts, setCounts] = useState<OutboxListResponse["counts"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const { confirm, confirmDialog } = useConfirmDialog();
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const res = await api.outboxList(tab.statuses, LIMIT);
      if (my !== seq.current) return;
      setItems(res.items);
      setCounts(res.counts);
      setNow(new Date());
      setError(null);
    } catch (err) {
      if (my === seq.current) setError(errorText(err));
    }
  }, [tab]);

  // Đổi tab: xóa danh sách cũ để không thấy mục của tab trước trong tích tắc
  useEffect(() => {
    setItems(null);
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function act(item: OutboxItem, action: "approve" | "cancel" | "recall" | "send-now") {
    const name = item.threadName?.trim() || item.threadId;
    const files = item.files.length > 0 ? ` (kèm ${item.files.length} file)` : "";
    const at = item.notBefore ? formatDateTime(item.notBefore, tz) : "";
    const options: Record<typeof action, ConfirmOptions> = {
      approve: { title: "Duyệt tin này?", message: `Tin tới "${name}" sẽ vào hàng chờ gửi và được gửi theo nhịp đã cài.`, confirmLabel: "Duyệt", tone: "normal" },
      "send-now": { title: "Gửi ngay tin này?", message: `Tin tới "${name}"${files} đang hẹn ${at} sẽ được gửi ngay bây giờ.`, confirmLabel: "Gửi ngay", tone: "normal" },
      recall: {
        title: "Thu hồi tin này?",
        message: `Tin đã gửi tới "${name}" sẽ bị thu hồi trên Zalo: mọi người trong hội thoại thấy "Tin nhắn đã được thu hồi". Không hoàn tác được.`,
        confirmLabel: "Thu hồi",
      },
      cancel: { title: "Hủy tin này?", message: `Tin tới "${name}" sẽ không được gửi. Không hoàn tác được.`, confirmLabel: "Hủy tin" },
    };
    const ok = await confirm(options[action]);
    if (!ok) return;
    setBusyId(item.id);
    try {
      const call = { approve: api.outboxApprove, recall: api.outboxRecall, cancel: api.outboxCancel, "send-now": api.outboxSendNow }[action];
      await call(item.id);
      await load();
      // Daemon thu hồi / gửi trong vài giây: hỏi lại sớm thay vì chờ nhịp tự cập nhật
      if (action === "recall" || action === "send-now") setTimeout(() => void load(), 3_000);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      <KillSwitchBanner />
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <header className="flex items-center gap-2.5 px-4 pt-4">
          <IconInbox size={22} className="text-zalo-500" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-semibold text-ink">Hàng đợi gửi</h1>
            <p className="text-[12.5px] text-ink-soft">Tin chờ duyệt, chờ gửi và lịch sử gửi - tự cập nhật</p>
          </div>
          <button type="button" onClick={() => void load()} title="Làm mới" aria-label="Làm mới" className="rounded-full p-2 text-ink-soft hover:bg-tile hover:text-ink">
            <IconRefresh size={18} />
          </button>
        </header>

        <div role="tablist" className="mt-2 flex gap-5 overflow-x-auto px-4 text-[14px]">
          {OUTBOX_TABS.map((t) => {
            const active = t.key === tab.key;
            const n = tabCount(t, counts);
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setParams(t.key === OUTBOX_TABS[0]!.key ? {} : { tab: t.key })}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 py-2 ${active ? "border-zalo-500 font-semibold text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
              >
                {t.label}
                {n > 0 && (
                  <span className={`rounded-full px-1.5 text-[11.5px] font-semibold ${t.key === "failed" ? "bg-red-500 text-white" : "bg-amber-400 text-amber-950"}`}>{n}</span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="border-t border-line p-4">
            <ErrorNote message={error} onRetry={() => void load()} />
          </div>
        )}
        {items === null && !error && (
          <div className="border-t border-line p-4">
            <LoadingText />
          </div>
        )}
        {items?.length === 0 && (
          <div className="border-t border-line p-4">
            <EmptyState text={tab.statuses.length > 0 ? `Không có tin nào ở mục "${tab.label}".` : "Hàng đợi chưa có tin nào."} />
          </div>
        )}
        {items &&
          groupByDay(items, tz, now).map((g) => (
            <div key={g.key}>
              <h2 className="border-t border-line bg-tile/40 px-4 py-1.5 text-[12.5px] font-medium text-ink-soft">{g.label}</h2>
              <ul>
                {g.items.map((it) => (
                  <OutboxItemRow
                    key={it.id}
                    item={it}
                    timeZone={tz}
                    now={now}
                    busy={busyId === it.id}
                    onApprove={() => void act(it, "approve")}
                    onCancel={() => void act(it, "cancel")}
                    onRecall={() => void act(it, "recall")}
                    onSendNow={() => void act(it, "send-now")}
                  />
                ))}
              </ul>
            </div>
          ))}
        {items && items.length >= LIMIT && <p className="border-t border-line px-4 py-3 text-center text-[12px] text-ink-soft">Chỉ hiện {LIMIT} tin gần nhất.</p>}
      </section>
      {confirmDialog}
    </div>
  );
}
