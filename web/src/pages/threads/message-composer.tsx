import { useCallback, useEffect, useRef, useState } from "react";
import type { ArchivedMessage, OutboxItem, TextStyleSpan } from "../../archive-api-types";
import { useDashboardShell } from "../../layout/dashboard-shell-context";
import { IconWarning } from "../../shared/dashboard-icons";
import { nowInZone } from "../../shared/format-archive-time";
import { ComposerAttachmentStrip } from "./composer-attachment-strip";
import { EMPTY_FORMAT, type FormatState } from "./composer-editor-commands";
import { ComposerFormatToolbar } from "./composer-format-toolbar";
import { ComposerReplyStrip } from "./composer-reply-strip";
import { ComposerRichEditor, type ComposerEditorHandle } from "./composer-rich-editor";
import { ComposerSendButton } from "./composer-send-button";
import { ComposerTopToolbar } from "./composer-top-toolbar";
import { MessageComposerSchedulePanel } from "./message-composer-schedule-panel";
import { OutboxSendStatusLine } from "./outbox-send-status-line";
import { useComposerAttachments } from "./use-composer-attachments";
import { useComposerFilePickers } from "./use-composer-file-pickers";
import { useComposerSend } from "./use-composer-send";
import { useOutboxItemTracking } from "./use-outbox-item-tracking";

const NOOP = () => {};
/** Khớp MAX_TEXT_LENGTH phía server (src/outbox/enqueue-outbox-request.ts) */
const MAX_TEXT = 2000;
/** Bật / tắt thanh định dạng nhớ trong trình duyệt này (như Zalo nhớ lần bật trước) */
const FORMAT_KEY = "kho.composer-format-on";
const loadFormatOn = () => {
  try {
    return localStorage.getItem(FORMAT_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Khung soạn tin kiểu Zalo PC: hàng công cụ (ảnh, Đính kèm File, Định dạng, Hẹn giờ, Lưu nháp), ô nhập có định dạng, khay file
 * chờ gửi dưới ô nhập. Enter gửi, Shift+Enter xuống dòng. Mọi nút chỉ ghi vào hàng đợi; daemon mới gửi thật. Đang trả lời một
 * tin thì có dải trích dẫn phía trên ô nhập.
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
  /** Tin chữ "gửi ngay" đã vào hàng đợi: khung chat hiện ngay bong bóng tạm (có định dạng) */
  onQueued: (item: OutboxItem, text: string, quote: ArchivedMessage | null, styles: TextStyleSpan[]) => void;
  replyTarget?: ArchivedMessage | null;
  onCancelReply?: () => void;
}) {
  const { me, killSwitch } = useDashboardShell();
  const editor = useRef<ComposerEditorHandle>(null);
  const [content, setContent] = useState({ length: 0, empty: true });
  const [formatOn, setFormatOn] = useState(loadFormatOn);
  const [fmt, setFmt] = useState<FormatState>(EMPTY_FORMAT);
  const [expanded, setExpanded] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sendDate, setSendDate] = useState("");
  const [sendTime, setSendTime] = useState("");
  const tracking = useOutboxItemTracking(NOOP);
  const [attachError, setAttachError] = useState<string | null>(null);
  const attachments = useComposerAttachments(setAttachError);
  // Chọn ảnh / file / thư mục xong thì vào khay chờ (không gửi ngay) như Zalo
  const pickers = useComposerFilePickers((files, as) => {
    setAttachError(null);
    attachments.add(files, as);
  }, setAttachError);
  const send = useComposerSend({
    threadId,
    editor,
    attachments,
    tracking,
    replyTarget,
    onCancelReply,
    onQueued,
    schedule: { date: sendDate, time: sendTime },
    onSent: () => setScheduleOpen(false),
  });

  const canSubmit = (!content.empty || attachments.items.length > 0) && content.length <= MAX_TEXT && send.busy === null;
  const error = send.error ?? attachError;

  // Vừa bấm Trả lời một tin: đưa con trỏ vào ô nhập để gõ luôn, như Zalo
  useEffect(() => {
    if (replyTarget) editor.current?.focus();
  }, [replyTarget]);

  const toggleFormat = useCallback(() => {
    setFormatOn((on) => {
      try {
        localStorage.setItem(FORMAT_KEY, on ? "0" : "1");
      } catch {
        /* trình duyệt chặn lưu: chỉ không nhớ được lần sau */
      }
      return !on;
    });
    editor.current?.focus();
  }, []);

  const onContent = useCallback((v: { length: number; empty: boolean }) => setContent(v), []);
  const onFiles = useCallback(
    (files: File[]) => {
      setAttachError(null);
      attachments.add(files);
    },
    [attachments],
  );

  function openSchedule() {
    if (!scheduleOpen) {
      const soon = nowInZone(me.timeZone, 30);
      setSendDate(soon.date);
      setSendTime(soon.time);
    }
    setScheduleOpen((v) => !v);
  }

  const sendButton = <ComposerSendButton disabled={!canSubmit} onClick={() => void send.submit("now")} />;

  return (
    <div className="border-t border-line bg-surface">
      {killSwitch?.killed && (
        <p className="flex items-center gap-1.5 px-4 pt-2 text-[12px] font-medium text-red-600 dark:text-red-400">
          <IconWarning size={14} /> Khóa khẩn cấp đang bật: tin sẽ nằm trong hàng đợi, không được gửi đi.
        </p>
      )}

      <ComposerTopToolbar
        busy={send.busy !== null}
        draftBusy={send.busy === "draft"}
        canSubmit={canSubmit}
        formatOn={formatOn}
        scheduleOpen={scheduleOpen}
        length={content.length}
        maxLength={MAX_TEXT}
        onPhoto={pickers.openPhotos}
        onPickFiles={pickers.openFiles}
        onPickFolder={pickers.openFolder}
        onToggleFormat={toggleFormat}
        onSchedule={openSchedule}
        onDraft={() => void send.submit("draft")}
      />
      {pickers.inputs}

      {scheduleOpen && (
        <MessageComposerSchedulePanel
          date={sendDate}
          time={sendTime}
          timeZone={me.timeZone}
          canSubmit={canSubmit}
          onDate={setSendDate}
          onTime={setSendTime}
          onSubmit={() => void send.submit("schedule")}
        />
      )}

      {replyTarget && onCancelReply && <ComposerReplyStrip target={replyTarget} onCancel={onCancelReply} />}

      {/* Số đo như Zalo Web: lề 10/12px; thường cao 50px; bật định dạng cao cố định 178px, Mở rộng khoảng 57% chiều cao màn
          hình; chữ ở trên, thanh định dạng + nút gửi ở dưới. Ô soạn luôn là con đầu: bật / tắt định dạng không mất chữ */}
      <div className={formatOn ? `flex min-h-[178px] flex-col gap-2 px-3 py-2.5 ${expanded ? "h-[57vh]" : "h-[178px]"}` : "flex items-center gap-2 px-3 py-2.5"}>
        <ComposerRichEditor
          ref={editor}
          formatOn={formatOn}
          fill={formatOn}
          placeholder={formatOn ? "Nhấn Ctrl + Shift + X để định dạng tin nhắn" : `Nhập tin nhắn tới ${threadName}`}
          onEnterSend={() => canSubmit && void send.submit("now")}
          onToggleFormat={toggleFormat}
          onEscape={() => {
            if (!replyTarget || !onCancelReply) return false;
            onCancelReply();
            return true;
          }}
          onFiles={onFiles}
          onChange={onContent}
          onFormatState={setFmt}
        />
        {formatOn ? (
          <ComposerFormatToolbar state={fmt} expanded={expanded} onCommand={(cmd) => editor.current?.run(cmd)} onToggleExpand={() => setExpanded((v) => !v)} trailing={sendButton} />
        ) : (
          sendButton
        )}
      </div>

      <ComposerAttachmentStrip
        items={attachments.items}
        disabled={send.busy !== null}
        onRemove={attachments.remove}
        onAddMore={attachments.items.every((a) => a.as === "photo") ? pickers.openPhotos : pickers.openFiles}
      />

      {(error || send.progress || tracking.item) && (
        <div className="space-y-1 px-4 pb-2">
          {send.progress && <p className="text-[12px] text-ink-soft">{send.progress}</p>}
          {error && <p className="break-words text-[12px] text-red-600 dark:text-red-400">{error}</p>}
          {tracking.item && <OutboxSendStatusLine item={tracking.item} timedOut={tracking.timedOut} timeZone={me.timeZone} onDismiss={tracking.clear} />}
        </div>
      )}
    </div>
  );
}
