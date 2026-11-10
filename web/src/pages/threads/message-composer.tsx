import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ArchivedMessage, OutboxItem, SendRequest } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { IconClock, IconFileText, IconSend } from "../../shared/action-and-media-icons";
import { IconWarning } from "../../shared/dashboard-icons";
import { nowInZone } from "../../shared/format-archive-time";
import { isEnterToSend } from "./composer-enter-to-send";
import { ComposerReplyStrip } from "./composer-reply-strip";
import { MessageComposerSchedulePanel } from "./message-composer-schedule-panel";
import { OutboxSendStatusLine } from "./outbox-send-status-line";
import { useOutboxItemTracking } from "./use-outbox-item-tracking";

const NOOP = () => {};
/** Khớp MAX_TEXT_LENGTH phía server (src/outbox/enqueue-outbox-request.ts) */
const MAX_TEXT = 2000;
/** Ô nhập tự cao theo chữ tới chừng này (khoảng 6 dòng) rồi cuộn trong ô */
const MAX_INPUT_HEIGHT = 160;

/**
 * Khung soạn tin cuối hội thoại, kiểu Zalo PC: hàng công cụ phía trên (Hẹn giờ, Lưu nháp - kho chỉ gửi được
 * chữ nên không có nút ảnh / file / sticker), dưới là ô nhập không viền tự cao theo chữ và nút gửi. Enter gửi
 * ngay như Zalo, Shift+Enter xuống dòng. Mọi nút chỉ ghi vào hàng đợi (`POST /api/outbox`); daemon mới là nơi
 * gửi thật. Gửi ngay = vào hàng đợi đã duyệt; khung chat hiện tin ngay (bong bóng tạm) tới khi tin thật vào kho. Đang trả lời một tin thì có dải trích dẫn
 * phía trên ô nhập; tin gửi đi (ngay, hẹn giờ hay nháp) mang ô trích dẫn tin đó như Zalo.
 */
export function MessageComposer({
  threadId,
  threadName,
  onQueued,
  replyTarget = null,
  onCancelReply,
}: {
  threadId: string;
  threadName: string;
  /** Tin "gửi ngay" đã vào hàng đợi: khung chat hiện ngay bong bóng tạm (không chờ, không dòng "Đã gửi") */
  onQueued: (item: OutboxItem, text: string, quote: ArchivedMessage | null) => void;
  replyTarget?: ArchivedMessage | null;
  onCancelReply?: () => void;
}) {
  const { me, killSwitch } = useDashboardShell();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<SendRequest["when"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sendDate, setSendDate] = useState("");
  const [sendTime, setSendTime] = useState("");
  // Chỉ còn dùng để hiện kết quả nháp / hẹn giờ; tin gửi ngay do bong bóng tạm trong khung chat lo
  const tracking = useOutboxItemTracking(NOOP);
  const input = useRef<HTMLTextAreaElement>(null);

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_TEXT && busy === null;

  // Ô nhập cao theo số dòng chữ, như Zalo
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [text]);

  // Vừa bấm Trả lời một tin: đưa con trỏ vào ô nhập để gõ luôn, như Zalo
  useEffect(() => {
    if (replyTarget) input.current?.focus();
  }, [replyTarget]);

  async function submit(when: SendRequest["when"]) {
    if (!canSubmit) return;
    if (when === "schedule" && (!sendDate || !sendTime)) {
      setError("Chọn đủ ngày và giờ gửi.");
      return;
    }
    const base: SendRequest = { threadId, text: trimmed, when, ...(replyTarget ? { replyToMessageId: replyTarget.id } : {}) };
    if (when === "now") return sendNow(base);
    setBusy(when);
    setError(null);
    try {
      const body: SendRequest = when === "schedule" ? { ...base, sendDate, sendTime } : base;
      const item: OutboxItem = await api.outboxCreate(body);
      setText("");
      onCancelReply?.();
      setScheduleOpen(false);
      tracking.show(item);
    } catch (err) {
      // Giữ nguyên chữ đang soạn để sửa rồi gửi lại
      setError(errorText(err));
    } finally {
      setBusy(null);
      input.current?.focus();
    }
  }

  /** Gửi ngay như Zalo: ô nhập trống liền để gõ tin sau, tin hiện ngay trong khung chat; lỗi thì trả chữ về ô nhập */
  async function sendNow(body: SendRequest) {
    const quote = replyTarget;
    setText("");
    onCancelReply?.();
    setError(null);
    tracking.clear();
    try {
      onQueued(await api.outboxCreate(body), body.text, quote);
    } catch (err) {
      setText((cur) => cur || body.text);
      setError(errorText(err));
    } finally {
      input.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Esc bỏ trả lời, như Zalo
    if (e.key === "Escape" && replyTarget && onCancelReply) {
      e.preventDefault();
      onCancelReply();
      return;
    }
    if (!isEnterToSend({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode })) return;
    e.preventDefault();
    void submit("now");
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
    <div className="border-t border-line bg-surface">
      {killSwitch?.killed && (
        <p className="flex items-center gap-1.5 px-4 pt-2 text-[12px] font-medium text-red-600 dark:text-red-400">
          <IconWarning size={14} /> Khóa khẩn cấp đang bật: tin sẽ nằm trong hàng đợi, không được gửi đi.
        </p>
      )}

      <div className="flex items-center gap-1 border-b border-line px-2 py-1">
        <ToolButton title="Hẹn giờ gửi tin này" active={scheduleOpen} disabled={busy !== null} onClick={openSchedule}>
          <IconClock size={22} />
        </ToolButton>
        <ToolButton title={busy === "draft" ? "Đang lưu nháp..." : "Lưu nháp: vào hàng đợi, chưa gửi"} disabled={!canSubmit} onClick={() => void submit("draft")}>
          <IconFileText size={22} />
        </ToolButton>
        {/* Bộ đếm chỉ có ích khi gần chạm trần */}
        {text.length > MAX_TEXT * 0.8 && (
          <span className={`ml-auto pr-2 text-[11px] tabular-nums ${trimmed.length > MAX_TEXT ? "text-red-600" : "text-ink-soft"}`}>
            {text.length}/{MAX_TEXT} ký tự
          </span>
        )}
      </div>

      {scheduleOpen && (
        <MessageComposerSchedulePanel
          date={sendDate}
          time={sendTime}
          timeZone={me.timeZone}
          canSubmit={canSubmit}
          onDate={setSendDate}
          onTime={setSendTime}
          onSubmit={() => void submit("schedule")}
        />
      )}

      {replyTarget && onCancelReply && <ComposerReplyStrip target={replyTarget} onCancel={onCancelReply} />}

      <div className="flex items-end gap-2 py-2 pl-4 pr-2">
        <textarea
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={MAX_TEXT}
          placeholder={`Nhập tin nhắn tới ${threadName}`}
          aria-label="Nội dung tin nhắn"
          className="block min-h-[36px] w-full resize-none bg-transparent py-1.5 text-[15px] leading-[1.5] text-ink outline-none placeholder:text-ink-soft"
        />
        <button
          type="button"
          onClick={() => void submit("now")}
          disabled={!canSubmit}
          title="Gửi ngay (Enter) - Shift+Enter để xuống dòng"
          aria-label="Gửi ngay"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[14px] font-semibold text-zalo-500 hover:bg-tile disabled:text-ink-soft/50 disabled:hover:bg-transparent"
        >
          <IconSend size={20} />
        </button>
      </div>

      {(error || tracking.item) && (
        <div className="space-y-1 px-4 pb-2">
          {error && <p className="break-words text-[12px] text-red-600 dark:text-red-400">{error}</p>}
          {tracking.item && (
            <OutboxSendStatusLine item={tracking.item} timedOut={tracking.timedOut} timeZone={me.timeZone} onDismiss={tracking.clear} />
          )}
        </div>
      )}
    </div>
  );
}

/** Nút trên hàng công cụ như Zalo PC: chỉ biểu tượng (22px, màu chữ chính), tên hiện khi rê chuột */
function ToolButton({ title, active = false, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-tile disabled:opacity-40 disabled:hover:bg-transparent ${
        active ? "bg-zalo-50 text-zalo-600 dark:bg-zalo-500/15 dark:text-zalo-500" : "text-ink"
      }`}
    >
      {children}
    </button>
  );
}
