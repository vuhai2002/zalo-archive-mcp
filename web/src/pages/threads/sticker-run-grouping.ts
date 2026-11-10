import type { ArchivedMessage } from "../../archive-api-types";
import { isSystemMessage, sameGroup } from "./message-grouping";
import type { ChatItem } from "./photo-album-grouping";

/** Số sticker mỗi hàng của cụm, như Zalo PC (đo từ ảnh chụp: 9 sticker liền nhau thành 3 hàng 3 cái) */
export const STICKERS_PER_ROW = 3;

/** Mục chỉ là MỘT tin sticker trần: sticker đã tải, không trích dẫn, chưa thu hồi */
function loneSticker(item: ChatItem): ArchivedMessage | null {
  const m = item.msg;
  if (item.album || item.stickers || isSystemMessage(m) || m.msgType !== "chat.sticker") return null;
  if (m.quoteMsgId || m.recalledAt !== null || m.attachments.length === 0) return null;
  return m.attachments.every((a) => a.kind === "sticker" && a.status === "done") ? m : null;
}

/**
 * Gộp sticker gửi liền nhau như Zalo PC: các tin sticker liên tiếp của cùng một người, cùng cụm (cùng ngày, cách nhau không
 * quá vài phút) thành MỘT mục, vẽ thành hàng ngang tối đa STICKERS_PER_ROW cái. Một sticker lẻ giữ nguyên như cũ.
 */
export function collapseStickerRuns(items: ChatItem[], tz: string): ChatItem[] {
  const out: ChatItem[] = [];
  let run: ArchivedMessage[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ msg: run[0]!, album: null, stickers: run });
    else if (run.length === 1) out.push({ msg: run[0]!, album: null });
    run = [];
  };
  for (const item of items) {
    const sticker = loneSticker(item);
    if (sticker && run.length > 0 && sameGroup(run.at(-1), sticker, tz)) {
      run.push(sticker);
      continue;
    }
    flush();
    if (sticker) run = [sticker];
    else out.push(item);
  }
  flush();
  return out;
}
