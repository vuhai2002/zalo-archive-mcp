import { useState } from "react";
import type { OutboxItem, SendRequest } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { IconClock, IconSend } from "../../shared/action-and-media-icons";
import { IconWarning } from "../../shared/dashboard-icons";
import { nowInZone } from "../../shared/format-archive-time";
import { BTN_PRIMARY, btnClass } from "../../shared/ui-bits";
import { OutboxSendStatusLine } from "./outbox-send-status-line";
import { useOutboxItemTracking } from "./use-outbox-item-tracking";

/** Khớp MAX_TEXT_LENGTH phía server (src/outbox/enqueue-outbox-request.ts) */
const MAX_TEXT = 2000;

/**
 * Ô soạn tin cuối khung hội thoại. Mọi nút đều chỉ ghi vào hàng đợi
 * (`POST /api/outbox`); daemon mới là nơi gửi thật. "Gửi ngay" = vào hàng đợi
 * đã duyệt rồi theo dõi tới khi có kết quả.
 */
export function MessageComposer({ threadId, onSent }: { threadId: string; onSent: () => void }) {
  const { me, killSwitch } = useDashboardShell();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<SendRequest["when"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sendDate, setSendDate] = useState("");
  const [sendTime, setSendTime] = useState("");
  const tracking = useOutboxItemTracking(onSent);

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_TEXT && busy === null;

  async function submit(when: SendRequest["when"]) {
    if (!canSubmit) return;
    if (when === "schedule" && (!sendDate || !sendTime)) {
      setError("Chọn đủ ngày và giờ gửi.");
      return;
    }
    setBusy(when);
    setError(null);
    try {
      const body: SendRequest = when === "schedule" ? { threadId, text: trimmed, when, sendDate, sendTime } : { threadId, text: trimmed, when };
      const item: OutboxItem = await api.outboxCreate(body);
      setText("");
      setScheduleOpen(false);
      if (when === "now") tracking.track(item);
      else tracking.show(item);
    } catch (err) {
      // Giữ nguyên chữ đang soạn để sửa rồi gửi lại
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  function openSchedule() {
    if (!scheduleOpen) {
      const soon = nowInZone(me.timeZone, 30);
      setSendDate(soon.date);
      setSendTime(soon.time);
    }
    setScheduleOpen((v) => !v);
  }

  return (
    <div className="space-y-2 border-t border-line bg-surface/95 p-3">
      {killSwitch?.killed && (
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-red-600 dark:text-red-400">
          <IconWarning size={14} /> Khóa khẩn cấp đang bật: tin sẽ nằm trong hàng đợi, không được gửi đi.
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={MAX_TEXT}
        placeholder="Soạn tin nhắn..."
        aria-label="Nội dung tin nhắn"
        className="gc-input block max-h-48 min-h-[72px] w-full resize-y"
      />

      {scheduleOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-tile/40 p-2.5">
          <label className="text-[12px] text-ink-soft">
            Ngày
            <input type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} className="gc-input mt-1 block py-1.5" />
          </label>
          <label className="text-[12px] text-ink-soft">
            Giờ
            <input type="time" value={sendTime} onChange={(e) => setSendTime(e.target.value)} className="gc-input mt-1 block py-1.5" />
          </label>
          <button type="button" className={BTN_PRIMARY} disabled={!canSubmit} onClick={() => submit("schedule")}>
            Đặt lịch gửi
          </button>
          <p className="basis-full text-[11px] text-ink-soft">Giờ theo múi giờ của kho ({me.timeZone}).</p>
        </div>
      )}

      {/* Điện thoại: ba nút chia đều một hàng, icon ẩn cho đủ chỗ (375px không
          chứa nổi bộ đếm + ba nút có icon, nút chính bị đẩy xuống dòng riêng) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Bộ đếm chỉ có ích khi gần chạm trần - để thường trực thì chiếm chỗ vô ích */}
        {text.length > MAX_TEXT * 0.8 && (
          <span className={`text-[11px] tabular-nums ${trimmed.length > MAX_TEXT ? "text-red-600" : "text-ink-soft"}`}>
            {text.length}/{MAX_TEXT} ký tự
          </span>
        )}
        <div className="grid grid-cols-3 gap-2 sm:ml-auto sm:flex">
          <button type="button" className={btnClass("secondary", "sm")} disabled={!canSubmit} onClick={() => submit("draft")}>
            {busy === "draft" ? "Đang lưu..." : "Lưu nháp"}
          </button>
          <button
            type="button"
            className={btnClass(scheduleOpen ? "selected" : "secondary", "sm")}
            disabled={busy !== null}
            onClick={openSchedule}
            aria-expanded={scheduleOpen}
          >
            <IconClock size={16} className="hidden sm:block" /> Hẹn giờ
          </button>
          <button type="button" className={btnClass("primary", "sm")} disabled={!canSubmit} onClick={() => submit("now")}>
            <IconSend size={16} className="hidden sm:block" /> {busy === "now" ? "Đang gửi..." : "Gửi ngay"}
          </button>
        </div>
      </div>

      {error && <p className="break-words text-[12px] text-red-600 dark:text-red-400">{error}</p>}
      {tracking.item && (
        <OutboxSendStatusLine
          item={tracking.item}
          timedOut={tracking.timedOut}
          timeZone={me.timeZone}
          onDismiss={tracking.clear}
        />
      )}
    </div>
  );
}
