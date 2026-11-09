import { useCallback, useEffect, useMemo, useState } from "react";
import type { ArchivedMessage } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { useConfirmDialog } from "../../shared/confirm-dialog";
import { formatFileSize } from "../../shared/format-file-size";
import { ForwardShareDialog } from "./forward-share-dialog";
import type { MessageActions } from "./message-action-rules";

const NOTICE_MS = 3_500;

/**
 * Trạng thái + thao tác trên tin của một hội thoại: Trả lời (dải trích dẫn ở khung soạn), Chuyển tiếp (hộp Chia sẻ),
 * Copy, Chọn nhiều tin nhắn, Xóa khỏi kho (hộp xác nhận có số tin + dung lượng file sẽ mất). Nick Chỉ đọc vẫn xóa
 * được (chỉ đụng kho trên máy) nhưng không trả lời / chuyển tiếp.
 */
export function useMessageActions({ readOnly, onDeleted }: { readOnly: boolean; onDeleted: (ids: number[]) => void }) {
  const [replyTarget, setReplyTarget] = useState<ArchivedMessage | null>(null);
  const [forwardTarget, setForwardTarget] = useState<ArchivedMessage | null>(null);
  /** null = không ở chế độ Chọn nhiều tin nhắn */
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const remove = useCallback(
    async (ids: number[]) => {
      try {
        const p = await api.messageDeletePreview(ids);
        if (p.messages === 0) return setNotice("Tin này không còn trong kho.");
        const files = p.files > 0 ? ` Kèm ${p.files} file (${formatFileSize(p.bytes)}) bị xóa khỏi ổ.` : "";
        const ok = await confirm({
          title: p.messages === 1 ? "Xóa tin này khỏi kho?" : `Xóa ${p.messages} tin khỏi kho?`,
          message:
            `Chỉ xóa trong kho: Zalo trên điện thoại, máy tính và phía người kia vẫn còn.${files} ` +
            "Không khôi phục được, và đồng bộ sau này cũng không lấy lại.",
          confirmLabel: "Xóa khỏi kho",
        });
        if (!ok) return;
        const r = await api.messageDelete(ids);
        onDeleted(ids);
        setSelected(null);
        setReplyTarget((cur) => (cur && ids.includes(cur.id) ? null : cur));
        setNotice(`Đã xóa ${r.deleted} tin khỏi kho${r.bytes > 0 ? `, giải phóng ${formatFileSize(r.bytes)}` : ""}.`);
      } catch (err) {
        setNotice(`Không xóa được: ${errorText(err)}`);
      }
    },
    [confirm, onDeleted],
  );

  const actions = useMemo<MessageActions>(
    () => ({
      reply: readOnly ? undefined : setReplyTarget,
      forward: readOnly ? undefined : setForwardTarget,
      // Cảm xúc hiện trên tin khi listener ghi lại (SSE tải lại); chỉ báo khi hỏng
      react: readOnly
        ? undefined
        : (msg, code) => void api.messageReact(msg.id, code).catch((err: unknown) => setNotice(`Không thả được cảm xúc: ${errorText(err)}`)),
      copy: (text) =>
        void navigator.clipboard.writeText(text).then(
          () => setNotice("Đã copy tin nhắn."),
          () => setNotice("Trình duyệt không cho copy."),
        ),
      startSelect: (ids) => setSelected(new Set(ids)),
      remove: (ids) => void remove(ids),
    }),
    [readOnly, remove],
  );

  /** Bấm một mục khi đang chọn: chọn cả mục (album = mọi ảnh), bấm lại thì bỏ */
  const toggle = useCallback((ids: number[]) => {
    setSelected((cur) => {
      if (!cur) return cur;
      const next = new Set(cur);
      const on = ids.every((id) => next.has(id));
      for (const id of ids) on ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const overlays = (
    <>
      {confirmDialog}
      {forwardTarget && (
        <ForwardShareDialog
          message={forwardTarget}
          onClose={() => setForwardTarget(null)}
          onDone={(text) => {
            setForwardTarget(null);
            setNotice(text);
          }}
        />
      )}
      {notice && (
        <div role="status" className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
          <span className="rounded-full bg-ink/85 px-4 py-2 text-[13px] text-surface shadow-lg">{notice}</span>
        </div>
      )}
    </>
  );

  return {
    actions,
    replyTarget,
    cancelReply: () => setReplyTarget(null),
    selected,
    toggle,
    cancelSelect: () => setSelected(null),
    deleteSelected: () => selected && selected.size > 0 && void remove([...selected]),
    overlays,
  };
}
