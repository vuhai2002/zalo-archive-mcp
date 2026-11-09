import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ArchivedMessage } from "../../archive-api-types";
import { IconCopy, IconForward, IconListCheck, IconMore, IconQuote, IconTrash } from "../../shared/message-action-icons";
import { canForward, canReply, copyTextOf, MENU_W, menuPosition, type MessageActions } from "./message-action-rules";

const ROUND =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-ink-soft shadow-sm hover:text-zalo-500 disabled:opacity-40 disabled:hover:text-ink-soft";

/**
 * Ba nút cạnh bong bóng khi rê chuột vào tin, như Zalo PC: Trả lời, Chuyển tiếp, Thêm (Copy tin nhắn, Chọn nhiều tin
 * nhắn, Xóa khỏi kho). Cha phải có lớp `group`; menu đang mở thì thanh nút giữ hiện. Album: chọn / xóa cả album.
 */
export function MessageHoverActions({ msg, album, actions, self }: { msg: ArchivedMessage; album: ArchivedMessage[] | null; actions: MessageActions; self: boolean }) {
  const [menuAt, setMenuAt] = useState<CSSProperties | null>(null);
  const ids = album ? album.map((p) => p.id) : [msg.id];
  const copyText = copyTextOf(msg, album);
  const forwardable = !album && canForward(msg);

  return (
    <div
      className={`flex shrink-0 items-center gap-1 self-center transition-opacity ${
        menuAt ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
      } ${self ? "flex-row-reverse" : ""}`}
    >
      {actions.reply && canReply(msg) && (
        <button type="button" className={ROUND} title="Trả lời" aria-label="Trả lời tin này" onClick={() => actions.reply?.(msg)}>
          <IconQuote size={15} />
        </button>
      )}
      {actions.forward && (
        <button
          type="button"
          className={ROUND}
          disabled={!forwardable}
          title={forwardable ? "Chia sẻ" : "Kho chỉ chuyển tiếp được tin chữ và link"}
          aria-label="Chuyển tiếp tin này"
          onClick={() => actions.forward?.(msg)}
        >
          <IconForward size={15} />
        </button>
      )}
      <MoreButton self={self} menuAt={menuAt} onMenuAt={setMenuAt}>
        <MenuItem icon={<IconCopy size={20} />} disabled={!copyText} onClick={() => copyText && actions.copy(copyText)}>
          Copy tin nhắn
        </MenuItem>
        <Divider />
        <MenuItem icon={<IconListCheck size={20} />} onClick={() => actions.startSelect(ids)}>
          Chọn nhiều tin nhắn
        </MenuItem>
        <Divider />
        <MenuItem icon={<IconTrash size={20} />} danger onClick={() => actions.remove(ids)}>
          Xóa khỏi kho
        </MenuItem>
      </MoreButton>
    </div>
  );
}

/** Nút Thêm + menu của nó; bấm ra ngoài, Esc, hay cuộn khung chat thì đóng */
function MoreButton({ self, menuAt, onMenuAt, children }: { self: boolean; menuAt: CSSProperties | null; onMenuAt: (p: CSSProperties | null) => void; children: ReactNode }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const open = menuAt !== null;
  useEffect(() => {
    if (!open) return;
    const close = () => onMenuAt(null);
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // Menu đứng yên trên màn hình: khung chat cuộn thì menu lệch khỏi tin - đóng luôn như Zalo
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, onMenuAt]);

  return (
    <span ref={wrap} className="flex">
      <button
        type="button"
        className={`${ROUND} ${open ? "text-zalo-500" : ""}`}
        title="Thêm"
        aria-label="Thêm thao tác"
        aria-expanded={open}
        onClick={(e) =>
          onMenuAt(open ? null : menuPosition(e.currentTarget.getBoundingClientRect(), self, { width: window.innerWidth, height: window.innerHeight }))
        }
      >
        <IconMore size={15} />
      </button>
      {menuAt && (
        <div
          role="menu"
          style={{ ...menuAt, width: MENU_W }}
          className="fixed z-50 rounded-xl border border-line bg-surface py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
          onClick={() => onMenuAt(null)}
        >
          {children}
        </div>
      )}
    </span>
  );
}

const Divider = () => <div className="mx-3 my-1 border-t border-line" />;

function MenuItem({ icon, danger = false, disabled = false, onClick, children }: { icon: ReactNode; danger?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 px-4 py-2.5 text-left text-[15px] hover:bg-tile disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? "text-red-600 dark:text-red-400" : "text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
