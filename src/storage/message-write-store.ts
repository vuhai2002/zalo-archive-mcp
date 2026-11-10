import type { DatabaseSync } from "node:sqlite";
import type { MessageSource, NormalizedMessage, NormalizedRecall } from "../archive/archived-message-types.js";
import { inTransaction } from "../shared/db-transaction.js";
import { noteContactSeen } from "./contact-store.js";
import { isDeletedMessage } from "./deleted-message-store.js";
import { findCliMsgIdTwin, isProvisionalMsgId, promoteProvisionalTwin } from "./provisional-message-id-twin.js";
import { foldVietnameseForSearch } from "../shared/fold-vietnamese-for-search.js";
import { POLL_MSG_TYPE, pollEventFromRawJson } from "../archive/zalo-poll-notice.js";
import { notePollActivity } from "./poll-store.js";

/** `id` = 0 khi tin đã bị xóa hẳn (My Documents) - không ghi lại */
export type UpsertResult = { id: number; inserted: boolean };

/**
 * Ghi một tin vào kho, khử trùng theo `msg_id`.
 *
 * Tin đã có (vd tin live rồi lại tới qua lần xin lại sau rớt mạng, hoặc chạy lại
 * nhật ký sau khi sửa parser): CẬP NHẬT các cột suy ra từ payload, nhưng GIỮ
 * `source`, `received_at`, `raw_json` của lần đầu - đó là sự thật về việc tin
 * đã vào kho bằng đường nào, lúc nào.
 *
 * Tin id tạm từ điện thoại (`mb_...`) được ghép với bản id thật của cùng tin: tới sau
 * bản thật thì bỏ qua, tới trước thì bản thật tới sau nâng nó lên id thật.
 *
 * Tin người dùng đã xóa hẳn (My Documents - `my-documents-deletion-store.ts`) thì không ghi lại.
 */
export function upsertMessage(
  db: DatabaseSync,
  msg: NormalizedMessage,
  meta: { source: MessageSource; receivedAt: string },
): UpsertResult {
  return inTransaction(db, () => {
    if (isDeletedMessage(db, msg.msgId)) return { id: 0, inserted: false };
    let existing = db.prepare("SELECT id FROM messages WHERE msg_id = ?").get(msg.msgId) as
      | { id: number }
      | undefined;
    if (!existing) {
      const twin = findCliMsgIdTwin(db, msg);
      if (twin && isProvisionalMsgId(msg.msgId)) return { id: twin.id, inserted: false };
      if (twin) existing = promoteProvisionalTwin(db, twin, msg);
    }

    let id: number;
    if (existing) {
      id = existing.id;
      db.prepare(
        `UPDATE messages SET cli_msg_id = :cliMsgId, thread_id = :threadId, thread_type = :threadType,
           sender_id = :senderId, sender_name = COALESCE(:senderName, sender_name), is_self = :isSelf,
           msg_type = :msgType, text = :text, quote_msg_id = :quoteMsgId, sent_at = :sentAt
         WHERE id = :id`,
      ).run({ ...messageParams(msg), id });
    } else {
      const row = db
        .prepare(
          `INSERT INTO messages (msg_id, cli_msg_id, thread_id, thread_type, sender_id, sender_name, is_self,
             msg_type, text, quote_msg_id, sent_at, received_at, source, raw_json)
           VALUES (:msgId, :cliMsgId, :threadId, :threadType, :senderId, :senderName, :isSelf,
             :msgType, :text, :quoteMsgId, :sentAt, :receivedAt, :source, :rawJson)
           RETURNING id`,
        )
        .get({
          ...messageParams(msg),
          msgId: msg.msgId,
          receivedAt: meta.receivedAt,
          source: meta.source,
          rawJson: msg.rawJson,
        }) as {
        id: number;
      };
      id = row.id;
    }

    db.prepare("DELETE FROM messages_fts WHERE rowid = ?").run(id);
    db.prepare("INSERT INTO messages_fts (rowid, body) VALUES (?, ?)").run(id, searchBody(msg));

    // Mỗi tin Zalo mang tối đa một tệp mỗi loại, nên khử trùng theo (tin, loại) chứ không theo
    // link: cùng một ảnh có thể tới lại với link khác (bản sao lưu điện thoại ghi bản .jxl gốc,
    // hoặc đính kèm đã được cấp link mới mà tin lấy bù vẫn mang link cũ)
    const insertAttachment = db.prepare(
      `INSERT OR IGNORE INTO attachments (msg_id, kind, remote_url, file_name, declared_size, created_at)
       SELECT :msgId, :kind, :remoteUrl, :fileName, :declaredSize, :createdAt
       WHERE NOT EXISTS (SELECT 1 FROM attachments WHERE msg_id = :msgId AND kind = :kind)`,
    );
    for (const a of msg.attachments) {
      insertAttachment.run({
        msgId: msg.msgId,
        kind: a.kind,
        remoteUrl: a.remoteUrl,
        fileName: a.fileName,
        declaredSize: a.declaredSize,
        createdAt: meta.receivedAt,
      });
    }

    // Lệnh thu hồi có thể đã tới trước tin gốc
    db.prepare(
      `UPDATE messages SET recalled_at = (SELECT recalled_at FROM message_recalls WHERE msg_id = :msgId)
       WHERE msg_id = :msgId AND recalled_at IS NULL
         AND EXISTS (SELECT 1 FROM message_recalls WHERE msg_id = :msgId)`,
    ).run({ msgId: msg.msgId });

    touchThread(db, msg);
    // Tin bình chọn: đánh dấu cuộc bình chọn có hoạt động mới để daemon hỏi lại chi tiết (phương án, số phiếu)
    const poll = msg.msgType === POLL_MSG_TYPE ? pollEventFromRawJson(msg.rawJson) : null;
    if (poll) notePollActivity(db, { pollId: poll.pollId, groupId: msg.threadId, question: poll.question, at: msg.sentAt });
    // Người gửi + người kia của hội thoại 1-1 vào danh bạ, để sau đó hỏi avatar
    noteContactSeen(db, msg.senderId, msg.isSelf ? null : msg.senderName);
    if (msg.threadType === "user" && msg.threadId !== msg.senderId) noteContactSeen(db, msg.threadId, null);
    return { id, inserted: !existing };
  });
}

/** Ghi lệnh thu hồi; tin gốc có rồi thì đánh dấu ngay, chưa có thì chờ tin tới. Tin đã xóa khỏi kho thì bỏ qua */
export function recordRecall(db: DatabaseSync, recall: NormalizedRecall): void {
  if (isDeletedMessage(db, recall.msgId)) return;
  inTransaction(db, () => {
    db.prepare(
      `INSERT OR IGNORE INTO message_recalls (msg_id, thread_id, recalled_by, recalled_at, raw_json)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(recall.msgId, recall.threadId, recall.recalledBy, recall.recalledAt, recall.rawJson);
    db.prepare("UPDATE messages SET recalled_at = ? WHERE msg_id = ? AND recalled_at IS NULL").run(
      recall.recalledAt,
      recall.msgId,
    );
  });
}

/** Tham số chung của INSERT và UPDATE (node:sqlite từ chối tham số thừa nên không kèm msgId) */
function messageParams(msg: NormalizedMessage) {
  return {
    cliMsgId: msg.cliMsgId,
    threadId: msg.threadId,
    threadType: msg.threadType,
    senderId: msg.senderId,
    senderName: msg.senderName,
    isSelf: msg.isSelf ? 1 : 0,
    msgType: msg.msgType,
    text: msg.text,
    quoteMsgId: msg.quoteMsgId,
    sentAt: msg.sentAt,
  };
}

function searchBody(msg: NormalizedMessage): string {
  const fileNames = msg.attachments.map((a) => a.fileName ?? "").join(" ");
  return foldVietnameseForSearch(`${msg.text} ${fileNames}`.trim());
}

/**
 * Cập nhật hội thoại: mốc tin mới nhất, và tên cho hội thoại 1-1 lấy từ tên
 * hiển thị của người kia (chỉ khi chưa có tên - tên từ danh bạ ưu tiên hơn).
 */
function touchThread(db: DatabaseSync, msg: NormalizedMessage): void {
  const nameFromMessage = msg.threadType === "user" && !msg.isSelf ? msg.senderName : null;
  db.prepare(
    `INSERT INTO threads (thread_id, thread_type, name, last_message_at, updated_at)
     VALUES (:threadId, :threadType, :name, :sentAt, :now)
     ON CONFLICT (thread_id, thread_type) DO UPDATE SET
       name = COALESCE(threads.name, excluded.name),
       last_message_at = MAX(COALESCE(threads.last_message_at, ''), excluded.last_message_at),
       updated_at = excluded.updated_at`,
  ).run({
    threadId: msg.threadId,
    threadType: msg.threadType,
    name: nameFromMessage,
    sentAt: msg.sentAt,
    now: new Date().toISOString(),
  });
}
