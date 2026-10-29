import type { DatabaseSync } from "node:sqlite";
import type { NormalizedMessage } from "../archive/archived-message-types.js";

/**
 * Tin trong bản sao lưu điện thoại mà điện thoại không ghi id toàn cục (thường là tin chính
 * mình gửi từ điện thoại) mang id tạm `mb_<cliMsgId>`. Cùng tin đó có thể vào kho bằng đường
 * khác với id thật (nghe trực tiếp, lấy bù), nên hai bản được ghép theo hội thoại + người gửi +
 * cliMsgId: mốc ms do máy người gửi đặt, mỗi tin một số (gửi nhiều ảnh một lần thì mỗi ảnh một số).
 */
export const PROVISIONAL_MSG_ID_PREFIX = "mb_";

export function isProvisionalMsgId(msgId: string): boolean {
  return msgId.startsWith(PROVISIONAL_MSG_ID_PREFIX);
}

type StoredTwin = { id: number; msg_id: string };

/**
 * Bản khác đã có trong kho của cùng tin. Tin tới mang id tạm: bản nào cũng tính. Tin tới mang
 * id thật: chỉ tính bản id tạm (hai id thật khác nhau là hai tin khác nhau).
 */
export function findCliMsgIdTwin(db: DatabaseSync, msg: NormalizedMessage): StoredTwin | undefined {
  if (!msg.cliMsgId) return undefined;
  const rows = db
    .prepare(
      `SELECT id, msg_id FROM messages
       WHERE thread_id = ? AND cli_msg_id = ? AND thread_type = ? AND sender_id = ? AND msg_id <> ?`,
    )
    .all(msg.threadId, msg.cliMsgId, msg.threadType, msg.senderId, msg.msgId) as StoredTwin[];
  const incomingProvisional = isProvisionalMsgId(msg.msgId);
  return rows.find((r) => incomingProvisional || isProvisionalMsgId(r.msg_id));
}

/**
 * Bản id tạm lên id thật khi bản thật tới: giữ hàng cũ (vị trí, source, lần vào kho đầu tiên),
 * đổi id + payload gốc sang của bản thật. Tệp đính kèm của bản tạm bị bỏ: link trong bản sao lưu
 * khác link của tin thật, bản thật tự xếp tệp của nó vào hàng đợi tải.
 */
export function promoteProvisionalTwin(db: DatabaseSync, twin: StoredTwin, msg: NormalizedMessage): { id: number } {
  db.prepare("DELETE FROM attachments WHERE msg_id = ?").run(twin.msg_id);
  db.prepare("UPDATE messages SET msg_id = ?, raw_json = ? WHERE id = ?").run(msg.msgId, msg.rawJson, twin.id);
  return { id: twin.id };
}
