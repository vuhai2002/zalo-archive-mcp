/**
 * Mã cảm xúc Zalo (trường `rIcon` của reaction, theo enum `Reactions` của zca-js) -> emoji
 * để hiện trên dashboard và cho Claude đọc. Mã lạ (Zalo thêm mới) thì giữ nguyên mã.
 * Sáu cảm xúc chính của Zalo đứng đầu bảng.
 */
const EMOJI_BY_CODE: Record<string, string> = {
  "/-heart": "❤️",
  "/-strong": "👍",
  ":>": "😆",
  ":o": "😮",
  ":-((": "😢",
  ":-h": "😡",
  ":-*": "😘",
  ":')": "😂",
  "/-shit": "💩",
  "/-rose": "🌹",
  "/-break": "💔",
  "/-weak": "👎",
  ";xx": "😍",
  ";-/": "😕",
  ";-)": "😉",
  "/-fade": "🥀",
  "/-li": "☀️",
  "/-bd": "🎂",
  "/-bome": "💣",
  "/-ok": "👌",
  "/-v": "✌️",
  "/-thanks": "🙏",
  "/-punch": "👊",
  "/-share": "🔗",
  "_()_": "🙏",
  "/-no": "🙅",
  "/-bad": "👎",
  "/-loveu": "🤟",
  "--b": "😓",
  ":((": "😭",
  "x-)": "😎",
  "8-)": "🤓",
  ";-d": "😁",
  "b-)": "😎",
  ":--|": "😐",
  "p-(": "😟",
  ":-bye": "👋",
  "|-)": "😴",
  ":wipe": "😅",
  "&-(": "😧",
  ":handclap": "👏",
  ">-|": "😠",
  ";-x": "🤐",
  ":-o": "😯",
  ";-s": "😳",
  ";-a": "😨",
  ":-<": "😞",
  ":))": "🤣",
  "$-)": "🤑",
  "/-beer": "🍺",
};

/** Emoji của một mã cảm xúc; null nếu chưa biết mã này */
export function emojiForReaction(code: string): string | null {
  return EMOJI_BY_CODE[code] ?? null;
}
