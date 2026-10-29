import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { OutboxItem, OutboxStatus } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useArchiveTimeZone } from "../../layout/dashboard-shell-context";
import { PageHeader } from "../../layout/page-header";
import { IconRefresh } from "../../shared/action-and-media-icons";
import { useConfirmDialog } from "../../shared/confirm-dialog";
import { IconInbox } from "../../shared/dashboard-icons";
import { KillSwitchBanner } from "../../shared/kill-switch-banner";
import { BTN_SECONDARY, EmptyState, ErrorNote, LoadingText } from "../../shared/ui-bits";
import { OutboxItemCard } from "./outbox-item-card";

/** "Lỗi" gom cả `rejected` (cổng gửi từ chối, vd trễ quá hạn) - với người dùng cả hai đều là "không gửi được" */
const TABS: { key: string; label: string; statuses: OutboxStatus[] }[] = [
  { key: "draft", label: "Nháp", statuses: ["draft"] },
  { key: "approved", label: "Chờ gửi", statuses: ["approved"] },
  { key: "sending", label: "Đang gửi", statuses: ["sending"] },
  { key: "sent", label: "Đã gửi", statuses: ["sent"] },
  { key: "failed", label: "Lỗi", statuses: ["failed", "rejected"] },
  { key: "cancelled", label: "Đã hủy", statuses: ["cancelled"] },
];
const LIMIT = 100;
const REFRESH_MS = 10_000;

export function OutboxPage() {
  const tz = useArchiveTimeZone();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get("tab")) ?? TABS[0]!;
  const [items, setItems] = useState<OutboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const lists = await Promise.all(tab.statuses.map((s) => api.outboxList(s, LIMIT)));
      if (my !== seq.current) return;
      setItems(lists.flatMap((l) => l.items).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
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

  async function act(item: OutboxItem, action: "approve" | "cancel") {
    const name = item.threadName?.trim() || item.threadId;
    const ok = await confirm(
      action === "approve"
        ? { title: "Duyệt tin này?", message: `Tin tới "${name}" sẽ vào hàng chờ gửi và được gửi theo nhịp đã cài.`, confirmLabel: "Duyệt", tone: "normal" }
        : { title: "Hủy tin này?", message: `Tin tới "${name}" sẽ không được gửi. Không hoàn tác được.`, confirmLabel: "Hủy tin" },
    );
    if (!ok) return;
    setBusyId(item.id);
    try {
      await (action === "approve" ? api.outboxApprove(item.id) : api.outboxCancel(item.id));
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={IconInbox}
        title="Hàng đợi"
        subtitle="Tin chờ duyệt, chờ gửi và lịch sử gửi"
        aside={
          <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
            <IconRefresh size={16} /> Làm mới
          </button>
        }
      />
      <KillSwitchBanner />

      <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab.key}
            onClick={() => setParams(t.key === TABS[0]!.key ? {} : { tab: t.key })}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              t.key === tab.key ? "border-zalo-500 bg-zalo-50 text-zalo-700" : "border-line bg-surface text-ink-soft hover:bg-tile hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}
      {items === null && !error && <LoadingText />}
      {items?.length === 0 && <EmptyState text={`Không có tin nào ở mục "${tab.label}".`} />}
      {items && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((it) => (
            <OutboxItemCard
              key={it.id}
              item={it}
              timeZone={tz}
              busy={busyId === it.id}
              onApprove={() => void act(it, "approve")}
              onCancel={() => void act(it, "cancel")}
            />
          ))}
        </ul>
      )}
      {items && items.length >= LIMIT && (
        <p className="text-center text-[12px] text-ink-soft">Chỉ hiện {LIMIT} tin gần nhất của mỗi trạng thái.</p>
      )}
      {confirmDialog}
    </div>
  );
}
