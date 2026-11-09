import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ArchivedMessage, OutboxItem, OutboxStatus } from "../../archive-api-types";
import { api } from "../../dashboard-api-client";

/** Tin vừa gõ trên dashboard, đang chờ daemon gửi + listener ghi lại vào kho */
export type PendingOutgoing = { item: OutboxItem; text: string; quote: ArchivedMessage | null; failed: string | null; sentSeenAt: number | null };

const TICK_MS = 700;
/** Đã gửi mà quá lâu chưa thấy tin trong kho (vd đang xem đoạn cũ): thôi giữ bong bóng tạm, tải lại phần mới nhất */
const SENT_GRACE_MS = 15_000;
const FAILED: ReadonlySet<OutboxStatus> = new Set(["failed", "cancelled", "rejected"]);

/** Trạng thái mới của một bong bóng tạm theo mục hàng đợi vừa hỏi về */
function withStatus(p: PendingOutgoing, next: OutboxItem, now: number): PendingOutgoing {
  if (next.status === "sent") return { ...p, item: next, sentSeenAt: now };
  if (FAILED.has(next.status)) return { ...p, item: next, failed: next.error ?? "Không gửi được." };
  return { ...p, item: next };
}

/**
 * Gửi như Zalo: bấm Enter là tin hiện NGAY cuối khung chat (bong bóng tạm, mờ nhẹ), không phải chờ daemon gửi rồi
 * listener ghi lại. Tin thật đã vào kho (cùng mã tin) thì bong bóng tạm tự biến mất; gửi hỏng thì bong bóng báo đỏ.
 */
export function usePendingOutgoing(o: {
  messages: ArchivedMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  stickToBottom: RefObject<boolean>;
  atLatest: boolean;
  backToLatest: () => void;
  refreshLatest: () => Promise<void>;
}) {
  const [pending, setPending] = useState<PendingOutgoing[]>([]);
  const { refreshLatest, atLatest, backToLatest, stickToBottom, scrollRef } = o;
  const have = useMemo(() => new Set(o.messages.map((m) => m.msgId)), [o.messages]);
  const live = useRef({ pending, have });
  live.current = { pending, have };

  const add = useCallback(
    (item: OutboxItem, text: string, quote: ArchivedMessage | null) => {
      stickToBottom.current = true;
      if (!atLatest) backToLatest();
      setPending((cur) => [...cur, { item, text, quote, failed: null, sentSeenAt: null }]);
    },
    [atLatest, backToLatest, stickToBottom],
  );

  // Một nhịp: hỏi trạng thái các tin đang chờ; bỏ bong bóng của tin đã vào kho (hoặc gửi xong quá lâu mà chưa thấy)
  const active = pending.length > 0;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const { pending: cur, have: inArchive } = live.current;
      const now = Date.now();
      const gone = (p: PendingOutgoing) =>
        (p.item.sentMsgId !== null && inArchive.has(p.item.sentMsgId)) || (p.sentSeenAt !== null && now - p.sentSeenAt > SENT_GRACE_MS);
      if (cur.some(gone)) {
        if (cur.some((p) => p.sentSeenAt !== null && !inArchive.has(p.item.sentMsgId ?? ""))) void refreshLatest();
        setPending((list) => list.filter((p) => !gone(p)));
      }
      for (const p of cur.filter((x) => !x.failed && x.sentSeenAt === null)) {
        api.outboxGet(p.item.id).then(
          (next) => {
            setPending((list) => list.map((x) => (x.item.id === next.id ? withStatus(x, next, Date.now()) : x)));
            // Vừa gửi xong: tải lại phần mới nhất (thường SSE đã báo trước khi listener ghi tin)
            if (next.status === "sent") setTimeout(() => void refreshLatest(), 400);
          },
          () => undefined,
        );
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [active, refreshLatest]);

  const visible = pending.filter((p) => !(p.item.sentMsgId !== null && have.has(p.item.sentMsgId)));

  // Bong bóng tạm mới hiện: kéo xuống đáy để thấy ngay
  const count = visible.length;
  const prevCount = useRef(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && count > prevCount.current && stickToBottom.current) el.scrollTop = el.scrollHeight;
    prevCount.current = count;
  }, [count, scrollRef, stickToBottom]);

  const dismiss = useCallback((id: number) => setPending((cur) => cur.filter((p) => p.item.id !== id)), []);
  return { visible, add, dismiss };
}
