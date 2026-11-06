import type { TextStyleSpan } from "../storage/message-text-styles.js";

/**
 * Nhắc tên (@) trong tin Zalo: `mentions` gửi kèm tin là danh sách {uid, pos, len, type} trỏ vào chữ "@Tên" (vị trí
 * theo chữ gốc, kiểu UTF-16 như chuỗi JS); type 1 là @All (uid "-1"). Zalo PC tô xanh chỗ nhắc và hiện tên ĐANG
 * dùng cho người đó (vd "@Khuê Lục" lúc gửi -> "@Lục Khuê Mẫn"); nơi gọi không biết tên thì giữ chữ gốc.
 */
export type ZaloMention = { uid: string; pos: number; len: number; type: number };

export function parseMentions(raw: unknown): ZaloMention[] {
  if (typeof raw !== "string") return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: ZaloMention[] = [];
  for (const m of list) {
    const x = m as Record<string, unknown> | null;
    const pos = Number(x?.pos);
    const len = Number(x?.len);
    if (!x || !Number.isInteger(pos) || !Number.isInteger(len) || pos < 0 || len <= 0) continue;
    out.push({ uid: String(x.uid ?? ""), pos, len, type: Number(x.type) || 0 });
  }
  return out;
}

const mentionSpan = (start: number, end: number): TextStyleSpan => ({
  start,
  end,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: null,
  size: null,
  mention: true,
});

/**
 * Thay chữ "@Tên" bằng "@" + tên gợi nhớ (khi `aliasOf` trả tên), thêm đoạn tô `mention`, dời các định dạng khác theo.
 * Chỗ nhắc không trỏ đúng vào chữ bắt đầu bằng "@", tràn chữ hay chồng chỗ nhắc trước thì bỏ qua.
 */
export function withMentionNames(
  text: string,
  spans: TextStyleSpan[],
  mentions: readonly ZaloMention[],
  aliasOf: (uid: string) => string | null,
): { text: string; spans: TextStyleSpan[] } {
  const valid = [...mentions]
    .sort((a, b) => a.pos - b.pos)
    .filter((m, i, all) => m.pos + m.len <= text.length && text[m.pos] === "@" && (i === 0 || all[i - 1]!.pos + all[i - 1]!.len <= m.pos));
  if (valid.length === 0) return { text, spans };

  const edits: Array<{ at: number; from: number; to: number }> = [];
  const added: TextStyleSpan[] = [];
  let out = "";
  let cursor = 0;
  for (const m of valid) {
    const alias = m.type === 1 ? null : aliasOf(m.uid)?.trim() || null;
    const shown = alias ? `@${alias}` : text.slice(m.pos, m.pos + m.len);
    out += text.slice(cursor, m.pos);
    added.push(mentionSpan(out.length, out.length + shown.length));
    out += shown;
    if (shown.length !== m.len) edits.push({ at: m.pos, from: m.len, to: shown.length });
    cursor = m.pos + m.len;
  }
  out += text.slice(cursor);

  // Vị trí cũ -> mới: cộng phần chênh của các chỗ nhắc đã đổi nằm trước; rơi vào giữa chỗ nhắc thì về cuối chỗ đó
  const move = (p: number) => {
    let shift = 0;
    for (const e of edits) {
      if (p >= e.at + e.from) shift += e.to - e.from;
      else if (p > e.at) return e.at + shift + e.to;
    }
    return p + shift;
  };
  return { text: out, spans: [...spans.map((s) => ({ ...s, start: move(s.start), end: move(s.end) })), ...added] };
}
