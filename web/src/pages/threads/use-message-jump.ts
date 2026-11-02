import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";

/** Ý định cuộn áp NGAY sau khi danh sách tin đổi: xuống đáy, giữ chỗ đang đọc, hoặc tới một tin */
export type ScrollIntent = { kind: "bottom" } | { kind: "keep"; prevHeight: number; prevTop: number } | { kind: "message"; id: number };

/** Lần nhảy tới tin (từ URL `?msg=`): `key` đổi mỗi lần bấm, kể cả bấm lại đúng tin cũ */
export type MessageFocus = { messageId: number; key: string };

const HIGHLIGHT_MS = 3_000;

/**
 * Cuộn tới một tin trong khung chat: mỗi mục bọc trong phần tử có `data-msg-ids` (id tin, cùng id các
 * ảnh nếu là album). Trả về false khi tin chưa có trong phần đang hiện.
 */
export function scrollToMessage(root: HTMLElement | null, id: number): boolean {
  const el = root?.querySelector<HTMLElement>(`[data-msg-ids~="${id}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: "center" });
  return true;
}

/**
 * Nhảy tới một tin (bấm kết quả tìm kiếm): tin đã có trong phần đang xem thì cuộn tới luôn, chưa có
 * thì tải trang quanh nó rồi cuộn (qua ý định "message"). Tin được tô nền một lúc cho dễ thấy.
 */
export function useMessageJump(o: {
  focus: MessageFocus | null;
  jumpTo: (id: number) => Promise<boolean>;
  intent: MutableRefObject<ScrollIntent | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  stickToBottom: MutableRefObject<boolean>;
}) {
  const { jumpTo, intent, scrollRef, stickToBottom } = o;
  const [highlightId, setHighlightId] = useState<number | null>(o.focus?.messageId ?? null);
  // Lần mở đầu (focus có sẵn lúc dựng khung chat) do trang đầu tải quanh tin đó, không nhảy thêm
  const handledKey = useRef(o.focus?.key ?? null);
  // Ảnh quanh tin vừa nhảy tới tải xong SAU khi cuộn làm khung dãn ra, đẩy tin đó khỏi màn hình: trong
  // lúc tin còn tô nền, mỗi lần một ảnh tải xong thì kéo tin về giữa lại
  const pinned = useRef<{ id: number; until: number } | null>(
    o.focus ? { id: o.focus.messageId, until: Date.now() + HIGHLIGHT_MS } : null,
  );

  const keepJumpTargetInView = useCallback(() => {
    const p = pinned.current;
    if (p && Date.now() < p.until) scrollToMessage(scrollRef.current, p.id);
  }, [scrollRef]);

  const jumpToMessage = useCallback(
    async (id: number) => {
      setHighlightId(id);
      pinned.current = { id, until: Date.now() + HIGHLIGHT_MS };
      stickToBottom.current = false;
      intent.current = { kind: "message", id };
      const alreadyShown = await jumpTo(id);
      if (alreadyShown) {
        intent.current = null;
        scrollToMessage(scrollRef.current, id);
      }
    },
    [jumpTo, intent, scrollRef, stickToBottom],
  );

  const { focus } = o;
  useEffect(() => {
    if (!focus || focus.key === handledKey.current) return;
    handledKey.current = focus.key;
    void jumpToMessage(focus.messageId);
  }, [focus, jumpToMessage]);

  useEffect(() => {
    if (highlightId === null) return;
    const t = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [highlightId]);

  return { highlightId, jumpToMessage, keepJumpTargetInView, clearHighlight: () => setHighlightId(null) };
}
