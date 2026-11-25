import type { DatabaseSync } from "node:sqlite";
import { foldVietnameseForSearch } from "../shared/fold-vietnamese-for-search.js";
import type { ThreadSender } from "./message-search-queries.js";

/**
 * Tìm người gửi theo tên (không dấu, khớp một phần) để lọc tin theo người: tên gợi nhớ, tên Zalo trong danh bạ hoặc tên
 * hiện trong tin. Có `threadId` thì chỉ xét người đã nhắn trong hội thoại đó. Toàn kho thì xét danh bạ trước (nhanh, dùng
 * chỉ mục theo người gửi để đếm); danh bạ không có ai khớp mới quét tên trong tin. Chỉ trả người có ít nhất một tin,
 * nhiều tin trước.
 */
type Row = { sender_id: string; is_self: number; n: number; alias: string | null; display_name: string | null; sender_name: string | null; avatar_url: string | null };

const PER_SENDER = `SELECT m.sender_id, MAX(m.is_self) AS is_self, COUNT(*) AS n, MAX(c.alias) AS alias, MAX(c.display_name) AS display_name,
  MAX(m.sender_name) AS sender_name, MAX(c.avatar_url) AS avatar_url
  FROM messages m LEFT JOIN contacts c ON c.user_id = m.sender_id`;

export function findSendersByName(db: DatabaseSync, name: string, opts: { threadId?: string; limit?: number } = {}): ThreadSender[] {
  const q = foldVietnameseForSearch(name.trim());
  if (!q) return [];
  const hit = (r: Row) => [r.alias, r.display_name, r.sender_name].some((s) => !!s && foldVietnameseForSearch(s).includes(q));
  let rows: Row[];
  if (opts.threadId) {
    rows = (db.prepare(`${PER_SENDER} WHERE m.thread_id = ? AND m.msg_type != 'group_event' GROUP BY m.sender_id`).all(opts.threadId) as Row[]).filter(hit);
  } else {
    rows = fromContacts(db, q);
    if (rows.length === 0) rows = (db.prepare(`${PER_SENDER} WHERE m.msg_type != 'group_event' GROUP BY m.sender_id`).all() as Row[]).filter(hit);
  }
  return rows
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, opts.limit ?? 20)
    .map((r) => ({
      senderId: String(r.sender_id),
      name: r.alias ?? r.display_name ?? r.sender_name ?? null,
      avatarUrl: r.avatar_url ?? null,
      isSelf: Number(r.is_self) === 1,
      count: Number(r.n),
    }));
}

function fromContacts(db: DatabaseSync, q: string): Row[] {
  const contacts = db.prepare("SELECT user_id, alias, display_name, avatar_url FROM contacts").all() as Array<{
    user_id: string;
    alias: string | null;
    display_name: string | null;
    avatar_url: string | null;
  }>;
  const count = db.prepare("SELECT COUNT(*) AS n, MAX(sender_name) AS sender_name FROM messages WHERE sender_id = ? AND msg_type != 'group_event'");
  return contacts
    .filter((c) => [c.alias, c.display_name].some((s) => !!s && foldVietnameseForSearch(s).includes(q)))
    .map((c) => {
      const r = count.get(c.user_id) as { n: number; sender_name: string | null };
      return { sender_id: c.user_id, is_self: 0, n: r.n, alias: c.alias, display_name: c.display_name, sender_name: r.sender_name, avatar_url: c.avatar_url };
    });
}
