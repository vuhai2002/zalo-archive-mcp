import type { DatabaseSync } from "node:sqlite";
import { withZaloEmoticons } from "../archive/zalo-emoticon-emoji.js";
import { withMentionNames, type ZaloMention } from "../archive/zalo-mention-names.js";
import type { MessageRow } from "./message-row-mapping.js";
import { parseTextStyles } from "./message-text-styles.js";

/** Chữ gốc của tin (trước khi đổi mã biểu cảm) cùng định dạng rtf và danh sách nhắc tên - vị trí nhắc tính theo chữ gốc */
export type MentionSource = { text: string; rtfParams: string | null; mentions: ZaloMention[] };

/**
 * Tin có nhắc tên: dựng lại chữ để hiện như Zalo PC - chỗ "@Tên" tô xanh, đổi sang tên Zalo PC đang hiện cho người
 * đó (tên gợi nhớ mình đặt, không có thì tên trong danh bạ - vd gửi lúc "@Khuê Lục", nay hiện "@Lục Khuê Mẫn"), rồi
 * mới đổi mã biểu cảm. Người chưa có trong danh bạ giữ chữ gốc. Tin link: nhắc tên nằm trong chữ của tin (`link.text`).
 */
export function applyMentionNames(db: DatabaseSync, messages: MessageRow[], sourceOf: (m: MessageRow) => MentionSource | undefined): void {
  const stmt = db.prepare("SELECT COALESCE(alias, display_name) AS name FROM contacts WHERE user_id = ?");
  const cache = new Map<string, string | null>();
  const aliasOf = (uid: string) => {
    if (!cache.has(uid)) cache.set(uid, (stmt.get(uid) as { name: string | null } | undefined)?.name ?? null);
    return cache.get(uid) ?? null;
  };
  for (const m of messages) {
    const src = sourceOf(m);
    if (!src || m.msgType === "group_event") continue;
    if (m.link) {
      const r = withMentionNames(m.link.text, m.link.textStyles, src.mentions, aliasOf);
      m.link = { ...m.link, text: r.text, textStyles: r.spans };
      continue;
    }
    const named = withMentionNames(src.text, parseTextStyles(src.rtfParams, src.text.length), src.mentions, aliasOf);
    const shown = withZaloEmoticons(named.text, named.spans);
    m.text = shown.text;
    m.textStyles = shown.spans;
  }
}
