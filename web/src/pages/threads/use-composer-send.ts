import { useState, type RefObject } from "react";
import type { ArchivedMessage, OutboxItem, SendRequest, TextStyleSpan } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { pickProblem, type SendAs } from "./composer-attachment-rules";
import type { ComposerEditorHandle } from "./composer-rich-editor";
import { zaloStylesToSpans } from "./composer-zalo-format";
import { uploadAll, type PendingAttachment } from "./use-composer-attachments";
import type { useOutboxItemTracking } from "./use-outbox-item-tracking";

export type ComposerBusy = SendRequest["when"] | "upload";

/**
 * Gửi từ khung soạn tin, mọi đường đều chỉ ghi vào hàng đợi (`POST /api/outbox`), daemon mới gửi thật:
 * - Tin chữ gửi ngay (không file): ô soạn trống liền, khung chat hiện bong bóng tạm có định dạng; lỗi thì trả chữ + định dạng.
 * - Có file trong khay (dán / kéo thả): tải lên lần lượt rồi gửi một tin - chùm ảnh, file khác, chữ sau cùng.
 * - Nút Gửi hình ảnh / Đính kèm File: chọn xong gửi ngay, chữ đang gõ dở vẫn nằm trong ô như Zalo.
 */
export function useComposerSend(o: {
  threadId: string;
  editor: RefObject<ComposerEditorHandle | null>;
  attachments: { items: PendingAttachment[]; clear: () => void };
  tracking: ReturnType<typeof useOutboxItemTracking>;
  replyTarget: ArchivedMessage | null;
  onCancelReply?: () => void;
  onQueued: (item: OutboxItem, text: string, quote: ArchivedMessage | null, styles: TextStyleSpan[]) => void;
  schedule: { date: string; time: string };
  onSent: () => void;
}) {
  const [busy, setBusy] = useState<ComposerBusy | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(when: SendRequest["when"]) {
    const ed = o.editor.current;
    if (!ed || busy) return;
    if (when === "schedule" && (!o.schedule.date || !o.schedule.time)) return setError("Chọn đủ ngày và giờ gửi.");
    const value = ed.read();
    const files = o.attachments.items;
    if (!value.text && files.length === 0) return;
    const quote = o.replyTarget;
    const body: SendRequest = {
      threadId: o.threadId,
      text: value.text,
      when,
      ...(value.styles.length > 0 ? { styles: value.styles } : {}),
      ...(quote ? { replyToMessageId: quote.id } : {}),
      ...(when === "schedule" ? { sendDate: o.schedule.date, sendTime: o.schedule.time } : {}),
    };
    setError(null);
    o.tracking.clear();

    // Tin chữ gửi ngay: như Zalo, ô soạn trống liền để gõ tin sau; lỗi thì trả lại (nếu chưa gõ gì mới)
    if (when === "now" && files.length === 0) {
      ed.clear();
      o.onCancelReply?.();
      try {
        o.onQueued(await api.outboxCreate(body), value.text, quote, zaloStylesToSpans(value.styles, value.text.length));
      } catch (err) {
        if (!ed.read().text) ed.setValue(value);
        setError(errorText(err));
      } finally {
        ed.focus();
      }
      return;
    }

    setBusy(when);
    try {
      const uploads = files.length > 0 ? await uploadAll(files, setProgress) : undefined;
      const item = await api.outboxCreate(uploads ? { ...body, uploads } : body);
      ed.clear();
      o.attachments.clear();
      o.onCancelReply?.();
      o.onSent();
      if (when === "now") o.tracking.track(item);
      else o.tracking.show(item);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
      setProgress(null);
      ed.focus();
    }
  }

  /** Nút Gửi hình ảnh (chùm ảnh) / Đính kèm File (thẻ file, kể cả ảnh): gửi ngay các file vừa chọn, không đụng chữ đang gõ */
  async function sendPicked(files: File[], as: SendAs) {
    if (busy) return;
    const problem = pickProblem(files, as);
    if (problem) return setError(problem);
    setError(null);
    o.tracking.clear();
    setBusy("upload");
    try {
      const uploads = await uploadAll(
        files.map((file) => ({ file, as })),
        setProgress,
      );
      o.tracking.track(await api.outboxCreate({ threadId: o.threadId, text: "", when: "now", uploads }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
      setProgress(null);
      o.editor.current?.focus();
    }
  }

  return { busy, progress, error, setError, submit, sendPicked };
}
