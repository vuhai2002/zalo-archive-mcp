import type { OutboxTextStyle } from "../storage/outbox-item-mapping.js";

/**
 * Chữ Claude viết (lệnh MCP send_message, schedule_message, draft_message, chữ của send_file) -> chữ trơn + định dạng Zalo.
 * Claude quen viết markdown, Zalo có thanh định dạng riêng, nên kho đổi:
 * - `**đậm**`, `*nghiêng*` hoặc `_nghiêng_`, `~~gạch ngang~~`;
 * - thẻ ngắn cho thứ markdown không có: `<u>gạch chân</u>`, màu `<red>` `<orange>` `<yellow>` `<green>` (4 màu của Zalo),
 *   cỡ `<small>` (Nhỏ) `<big>` (Lớn) `<huge>` (Rất lớn);
 * - dòng bắt đầu bằng `- ` / `* ` / `+ ` / `• ` là gạch đầu dòng, `1. ` / `1) ` là đánh số; thụt khoảng trắng trước dấu đó
 *   sâu hơn dòng danh sách trên thì thành bậc con (tối đa 5 bậc).
 * Dấu chỉ có tác dụng khi đứng đúng chỗ (như markdown): `2*3*4`, `ten_bien_x` giữ nguyên; dấu thiếu cặp giữ nguyên là chữ;
 * `\*` để viết dấu sao thật. Chữ không có dấu nào thì ra y như cũ, không định dạng. Module thuần.
 */
export type ZaloFormatted = { text: string; styles: OutboxTextStyle[] };

const TAG_CODES: Record<string, string> = {
  u: "u",
  red: "c_db342e",
  orange: "c_f27806",
  yellow: "c_f7b503",
  green: "c_15a85f",
  small: "f_13",
  big: "f_18",
  huge: "f_20",
};
const DELIM_CODES: Record<string, string> = { "**": "b", "~~": "s", "*": "i", _: "i" };
const TAG_RE = /^<(\/?)(u|red|orange|yellow|green|small|big|huge)>/i;
const LIST_RE = /^( *)(?:([-*+•])|(\d{1,3})[.)])[ \t]+(?=\S)/;
const MAX_INDENT = 5;
const ESCAPABLE = new Set(["*", "_", "~", "<", "\\"]);
const BOUNDARY = /[\s\p{P}\p{S}]/u;

type Tok = { ch: string } | { key: string; code: string; raw: string; open: boolean; close: boolean };
type Range = { start: number; end: number; code: string };

/** Một dòng (đã bỏ dấu danh sách): chữ trơn + các khoảng định dạng (vị trí trong dòng) */
function parseInline(line: string): { text: string; ranges: Range[] } {
  const toks: Tok[] = [];
  for (let i = 0; i < line.length; ) {
    const c = line[i]!;
    if (c === "\\" && ESCAPABLE.has(line[i + 1] ?? "")) {
      toks.push({ ch: line[i + 1]! });
      i += 2;
      continue;
    }
    const tag = TAG_RE.exec(line.slice(i));
    if (tag) {
      const name = tag[2]!.toLowerCase();
      toks.push({ key: `<${name}>`, code: TAG_CODES[name]!, raw: tag[0], open: !tag[1], close: !!tag[1] });
      i += tag[0].length;
      continue;
    }
    const two = line.slice(i, i + 2);
    // "***" ở chỗ đóng (vd "**đậm *nghiêng***"): đóng nghiêng trước rồi mới tới đậm, như markdown
    const closingTriple = line.startsWith("***", i) && i > 0 && !/\s/.test(line[i - 1]!);
    const raw = closingTriple ? "*" : two === "**" || two === "~~" ? two : c === "*" || c === "_" ? c : null;
    if (!raw) {
      toks.push({ ch: c });
      i++;
      continue;
    }
    // Như markdown: mở khi sau dấu là chữ và trước là đầu dòng / khoảng trắng / dấu câu; đóng thì ngược lại
    const prev = line[i - 1] ?? "";
    const next = line[i + raw.length] ?? "";
    const open = next !== "" && !/\s/.test(next) && (prev === "" || BOUNDARY.test(prev));
    const close = prev !== "" && !/\s/.test(prev) && (next === "" || BOUNDARY.test(next));
    toks.push({ key: raw, code: DELIM_CODES[raw]!, raw, open, close });
    i += raw.length;
  }

  // Ghép cặp dấu mở / đóng; dấu không có cặp là chữ thường
  const pairs: Array<[number, number]> = [];
  const stack: number[] = [];
  toks.forEach((t, i) => {
    if ("ch" in t) return;
    if (t.close) {
      let j = stack.length - 1;
      while (j >= 0 && (toks[stack[j]!] as { key: string }).key !== t.key) j--;
      if (j >= 0) {
        pairs.push([stack[j]!, i]);
        stack.length = j;
        return;
      }
    }
    if (t.open) stack.push(i);
  });
  const used = new Set(pairs.flat());
  let text = "";
  const pos: number[] = [];
  toks.forEach((t, i) => {
    pos[i] = text.length;
    if ("ch" in t) text += t.ch;
    else if (!used.has(i)) text += t.raw;
  });
  const ranges = pairs
    .map(([o, c]) => ({ start: pos[o]!, end: pos[c]!, code: (toks[o] as { code: string }).code }))
    .filter((r) => r.end > r.start);
  return { text, ranges };
}

/** Các khoảng định dạng chồng nhau -> các đoạn không chồng, mỗi đoạn gộp mã như Zalo ("b,c_db342e,f_20") */
function toZaloRuns(ranges: Range[]): OutboxTextStyle[] {
  const cuts = [...new Set(ranges.flatMap((r) => [r.start, r.end]))].sort((a, b) => a - b);
  const out: OutboxTextStyle[] = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = cuts[k]!;
    const b = cuts[k + 1]!;
    const on = ranges.filter((r) => r.start <= a && r.end >= b).sort((x, y) => x.start - y.start);
    // Màu / cỡ lồng nhau: khoảng mở sau (trong cùng) thắng
    const last = (prefix: string) => on.filter((r) => r.code.startsWith(prefix)).pop()?.code;
    const codes = ["b", "i", "u", "s"].filter((c) => on.some((r) => r.code === c));
    const color = last("c_");
    const size = last("f_");
    const st = [...codes, ...(color ? [color] : []), ...(size ? [size] : [])].join(",");
    if (!st) continue;
    const prev = out[out.length - 1];
    if (prev && prev.st === st && prev.start + prev.len === a) prev.len += b - a;
    else out.push({ start: a, len: b - a, st });
  }
  return out;
}

export function markdownToZaloStyles(input: string): ZaloFormatted {
  const lines: string[] = [];
  const ranges: Range[] = [];
  const block: OutboxTextStyle[] = [];
  let offset = 0;
  // Bậc danh sách theo độ thụt so với các dòng danh sách phía trên (2, 3 hay 4 khoảng trắng đều được)
  let levels: number[] = [];
  for (const raw of input.replace(/\r\n?/g, "\n").split("\n")) {
    const m = LIST_RE.exec(raw);
    let content = raw;
    let list: "lst_1" | "lst_2" | null = null;
    let level = 0;
    if (m) {
      const spaces = m[1]!.length;
      while (levels.length && spaces < levels[levels.length - 1]!) levels.pop();
      if (!levels.length || spaces > levels[levels.length - 1]!) levels.push(spaces);
      level = Math.min(MAX_INDENT, levels.length - 1);
      list = m[2] ? "lst_1" : "lst_2";
      content = raw.slice(m[0].length);
    } else levels = [];
    const parsed = parseInline(content);
    for (const r of parsed.ranges) ranges.push({ start: r.start + offset, end: r.end + offset, code: r.code });
    if (list && parsed.text.length > 0) {
      block.push({ start: offset, len: parsed.text.length, st: list });
      if (level > 0) block.push({ start: offset, len: parsed.text.length, st: `ind_${level}0` });
    }
    lines.push(parsed.text);
    offset += parsed.text.length + 1;
  }
  return { text: lines.join("\n"), styles: [...toZaloRuns(ranges), ...block] };
}
