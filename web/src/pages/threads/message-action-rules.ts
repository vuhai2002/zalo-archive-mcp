import type { ArchivedMessage } from "../../archive-api-types";

/** Cỡ menu Thêm như Zalo PC (rộng cố định; cao ước lượng để biết có đủ chỗ mở xuống không) */
export const MENU_W = 272;
const MENU_H = 200;
const GAP = 6;
export type MenuPlacement = { left: number; top?: number; bottom?: number };

/**
 * Thao tác trên một tin trong khung chat (thanh nút khi rê chuột + menu Thêm), như Zalo PC. `reply` / `forward` bỏ trống
 * khi nick Chỉ đọc (không gửi gì). `ids` của Chọn nhiều / Xóa: cả album khi tin là khung album.
 */
export type MessageActions = {
  reply?: (msg: ArchivedMessage) => void;
  forward?: (msg: ArchivedMessage) => void;
  /** Thả cảm xúc (mã Zalo của 6 cảm xúc nhanh) */
  react?: (msg: ArchivedMessage, code: string) => void;
  copy: (text: string) => void;
  startSelect: (ids: number[]) => void;
  remove: (ids: number[]) => void;
};

/** Zalo không cho trả lời tin đã thu hồi hay bình chọn */
export const canReply = (m: ArchivedMessage) => m.recalledAt === null && m.msgType !== "group.poll";

/** Thả cảm xúc cần mã tin thật của Zalo (tin lấy từ điện thoại có mã "mb_..." thì không); không vào tin đã thu hồi */
export const canReact = (m: ArchivedMessage) => m.recalledAt === null && /^\d+$/.test(m.msgId);

/** Kho chỉ chuyển tiếp được tin chữ và link (máy chủ kiểm lại) */
export const canForward = (m: ArchivedMessage) =>
  m.recalledAt === null && ((m.msgType === "webchat" && m.text.trim().length > 0) || m.link !== null);

/** Chữ để Copy: chữ của tin (tin link là chữ người gửi gõ, có link); album thì chú thích; không có chữ thì null */
export function copyTextOf(m: ArchivedMessage, album: ArchivedMessage[] | null): string | null {
  const text = album ? album.map((p) => p.text.trim()).filter(Boolean).join("\n") : (m.link?.text ?? m.text);
  return text.trim() ? text : null;
}

/**
 * Chỗ đặt menu như Zalo PC: mép menu thẳng mép nút Thêm (tin người khác: mép trái, menu trải sang phải; tin mình: mép
 * phải, trải sang trái), nằm ngay trên nút khi phía dưới không đủ chỗ, không thì ngay dưới. Dùng vị trí cố định trên
 * màn hình để menu không bị khung chat cắt mất, và luôn nằm trong cửa sổ.
 */
export function menuPosition(
  button: { left: number; right: number; top: number; bottom: number },
  self: boolean,
  viewport: { width: number; height: number },
): MenuPlacement {
  const left = Math.min(Math.max(8, self ? button.right - MENU_W : button.left), viewport.width - MENU_W - 8);
  const up = viewport.height - button.bottom < MENU_H + GAP + 8;
  return up ? { left, bottom: viewport.height - button.top + GAP } : { left, top: button.bottom + GAP };
}
