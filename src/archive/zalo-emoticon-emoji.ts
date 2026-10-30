import type { TextStyleSpan } from "../storage/message-text-styles.js";

/**
 * Mã biểu cảm của Zalo (người gõ `:d`, `/-heart`... trong tin, và mã cảm xúc `rIcon` khi thả vào
 * tin). Zalo lưu nguyên mã, app tự vẽ hình riêng. Bảng này chọn emoji gần nhất với HÌNH Zalo vẽ
 * (đối chiếu từng ô trong ảnh biểu cảm của Zalo Web), không theo tên gọi. Mã có trong Zalo mà
 * không có emoji tương ứng (vd `:v` hình Pac-Man) để null: giữ nguyên chữ.
 */
const EMOJI_BY_CODE: Record<string, string | null> = {
  // Sáu cảm xúc chính
  "/-heart": "❤️",
  "/-strong": "👍",
  ":>": "😆",
  ":o": "😮",
  ":-((": "😭",
  ":-h": "😡",
  // Mặt
  ":)": "🙂",
  ":(": "🙁",
  ":d": "😁",
  ":p": "😜",
  ":b": "😍",
  ":')": "😂",
  ":~": "😖",
  ":$": "☺️",
  ":3": "😊",
  ":z": "😴",
  ":((": "😢",
  ":))": "😎",
  ":*": "😚",
  ":-*": "😘",
  ":|": "😐",
  ":!": "😨",
  ":l": "😑",
  ":q": "😫",
  ":x": "🤐",
  ":t": "🤮",
  ":;": "😎",
  ":+": "😠",
  ":-|": "😰",
  ":-<": "😞",
  ":-l": "😒",
  ":-o": "🥱",
  ":-r": "😉",
  ":-f": "😵",
  ":-bye": "👋",
  ":wipe": "😅",
  ":handclap": "🙏",
  ";d": "🤔",
  ";p": "🤭",
  ";o": "🙄",
  ";g": "😋",
  ";f": "💪",
  ";8": "😫",
  ";!": "💣",
  ";?": "😕",
  ";xx": "🤕",
  ";-)": "😏",
  ";-d": "😊",
  ";-/": "😩",
  ";-x": "🤫",
  ";-s": "🤬",
  ";-a": "😱",
  ";-!": "💀",
  "8-)": "😎",
  "8*": "🥺",
  "8*)": "🥴",
  "b-)": "😬",
  "x-)": "😏",
  "p-(": "😣",
  "--b": "😥", // Zalo vẽ mắt ngước lên + giọt mồ hôi; 😓 trên Windows là mặt nhắm mắt, khác hẳn
  "&-(": "😰",
  "|-)": "😪",
  ">-|": "😤",
  "$-)": "🤑",
  ":--|": "😟",
  "/-showlove": "🥰",
  // Đồ vật, cử chỉ
  "/-beer": "🍺",
  "/-coffee": "☕",
  "/-rose": "🌹",
  "/-fade": "🥀",
  "/-bd": "🔪",
  "/-bome": "💣",
  "/-cake": "🎂",
  "/-break": "💔",
  "/-shit": "💩",
  "/-li": "⚡",
  "/-flag": "🇻🇳",
  "/-weak": "👎",
  "/-ok": "👌",
  "/-v": "✌️",
  "/-thanks": "🙏",
  "/-punch": "✊",
  "/-share": "🤝",
  "_()_": "🙏",
  "/-no": "☝️",
  "/-bad": "👎",
  "/-loveu": "🤟",
  // Không có emoji gần đúng: giữ nguyên chữ
  ":v": null,
  ":-dig": null,
};

const MAX_CODE_LENGTH = Math.max(...Object.keys(EMOJI_BY_CODE).map((c) => c.length));
const TRAILING_PUNCTUATION = /^[.,!?…]*$/;

/** Emoji của một mã Zalo (cảm xúc hoặc mã gõ trong tin); null nếu chưa biết hoặc không có emoji */
export function emojiForZaloCode(code: string): string | null {
  return EMOJI_BY_CODE[code.toLowerCase()] ?? null;
}

/** Cắt một cụm chữ (không có khoảng trắng) thành toàn mã biểu cảm (+ dấu câu cuối); null nếu không được */
function splitIntoCodes(token: string): string[] | null {
  const pieces: string[] = [];
  let i = 0;
  while (i < token.length) {
    let len = Math.min(MAX_CODE_LENGTH, token.length - i);
    while (len >= 2 && !(token.slice(i, i + len).toLowerCase() in EMOJI_BY_CODE)) len--;
    if (len < 2) break;
    pieces.push(token.slice(i, i + len));
    i += len;
  }
  if (pieces.length === 0 || !TRAILING_PUNCTUATION.test(token.slice(i))) return null;
  if (i < token.length) pieces.push(token.slice(i));
  return pieces;
}

/**
 * Đổi mã biểu cảm trong chữ tin sang emoji để hiển thị (DB vẫn giữ mã gốc). Chỉ đổi cụm đứng riêng
 * giữa các khoảng trắng và gồm toàn mã, để "Note:do", "10:30", link không bị đổi nhầm. Định dạng
 * chữ (vị trí theo UTF-16) được dời theo độ dài mới.
 */
export function withZaloEmoticons(text: string, spans: TextStyleSpan[] = []): { text: string; spans: TextStyleSpan[] } {
  const edits: Array<{ at: number; from: number; to: number }> = [];
  let out = "";
  let pos = 0;
  for (const part of text.split(/(\s+)/)) {
    const pieces = part && !/^\s/.test(part) ? splitIntoCodes(part) : null;
    if (pieces) {
      const replaced = pieces.map((p) => emojiForZaloCode(p) ?? p).join("");
      if (replaced !== part) edits.push({ at: pos, from: part.length, to: replaced.length });
      out += replaced;
    } else {
      out += part;
    }
    pos += part.length;
  }
  if (edits.length === 0) return { text, spans };

  // Vị trí cũ -> mới: cộng phần chênh của các cụm đã đổi nằm trước; rơi vào giữa cụm thì về cuối cụm
  const move = (p: number) => {
    let shift = 0;
    for (const e of edits) {
      if (p >= e.at + e.from) shift += e.to - e.from;
      else if (p > e.at) return e.at + shift + e.to;
    }
    return p + shift;
  };
  return { text: out, spans: spans.map((s) => ({ ...s, start: move(s.start), end: move(s.end) })) };
}
