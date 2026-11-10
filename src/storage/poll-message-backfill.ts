import type { DatabaseSync } from "node:sqlite";
import { POLL_MSG_TYPE, pollEventFromRawJson, pollNoticeOf } from "../archive/zalo-poll-notice.js";
import { inTransaction } from "../shared/db-transaction.js";
import { foldVietnameseForSearch } from "../shared/fold-vietnamese-for-search.js";
import { notePollActivity } from "./poll-store.js";
import { getMeta, setMeta } from "./thread-directory-store.js";

const DONE_KEY = "poll_message_backfill_v1";

/**
 * Một lần cho các tin bình chọn vào kho TRƯỚC khi kho biết đọc loại tin này: chữ "[group.poll]" thành câu như Zalo (cả bảng
 * tìm kiếm, để tìm theo câu hỏi ra được), và ghi hoạt động bình chọn để daemon lấy chi tiết cả các cuộc cũ. Tin mới từ đây
 * được xử lý ngay lúc ghi. Trả số tin đã sửa chữ + số cuộc bình chọn ghi nhận.
 */
export function backfillPollMessages(db: DatabaseSync, now: Date = new Date()): { texts: number; polls: number } {
  if (getMeta(db, DONE_KEY)) return { texts: 0, polls: 0 };
  const rows = db
    .prepare("SELECT id, thread_id, text, sent_at, is_self, raw_json FROM messages WHERE msg_type = ?")
    .all(POLL_MSG_TYPE) as Array<{ id: number; thread_id: string; text: string; sent_at: string; is_self: number; raw_json: string }>;
  return inTransaction(db, () => {
    const polls = new Set<string>();
    let texts = 0;
    const setText = db.prepare("UPDATE messages SET text = ? WHERE id = ?");
    const dropFts = db.prepare("DELETE FROM messages_fts WHERE rowid = ?");
    const addFts = db.prepare("INSERT INTO messages_fts (rowid, body) VALUES (?, ?)");
    for (const r of rows) {
      const ev = pollEventFromRawJson(r.raw_json);
      if (!ev) continue;
      notePollActivity(db, { pollId: ev.pollId, groupId: r.thread_id, question: ev.question, at: r.sent_at });
      polls.add(ev.pollId);
      if (r.text !== `[${POLL_MSG_TYPE}]`) continue;
      const text = pollNoticeOf(ev, { selfUid: r.is_self ? ev.actorId : null, nameOf: () => null }).text;
      setText.run(text, r.id);
      dropFts.run(r.id);
      addFts.run(r.id, foldVietnameseForSearch(text));
      texts++;
    }
    setMeta(db, DONE_KEY, now.toISOString());
    return { texts, polls: polls.size };
  });
}
