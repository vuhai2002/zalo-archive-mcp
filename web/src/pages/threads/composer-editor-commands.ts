import { colorToHex, EDITOR_FONT_SIZE, isZaloColor, sizeFromFontAttr, type ZaloSize } from "./composer-zalo-format";

/**
 * Lệnh của thanh Định dạng tin nhắn trên ô soạn (contenteditable): dùng `document.execCommand` của trình duyệt (đậm, danh
 * sách, thụt lề, hoàn tác... đều có sẵn, và Ctrl+Z hoàn tác được). Cỡ chữ / màu: trình duyệt bọc `<font size|color>`; chọn
 * "Trung bình" / màu mặc định thì đặt giá trị đánh dấu rồi gỡ thẻ đó đi, để chữ trở về như chữ thường.
 */
export type FormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  bullet: boolean;
  number: boolean;
  size: ZaloSize | null;
  color: string | null;
};
export const EMPTY_FORMAT: FormatState = { bold: false, italic: false, underline: false, strike: false, bullet: false, number: false, size: null, color: null };

export type EditorCommand =
  | { kind: "bold" | "italic" | "underline" | "strike" | "clear" | "bullet" | "number" | "indent" | "outdent" | "undo" | "redo" }
  | { kind: "size"; size: ZaloSize | null }
  | { kind: "color"; hex: string | null };

/** Màu đánh dấu "về màu mặc định": không bao giờ là màu thật được gửi đi */
const DEFAULT_COLOR_MARK = "#010203";
const NORMAL_SIZE = EDITOR_FONT_SIZE.normal;

const SIMPLE: Record<string, string> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strike: "strikeThrough",
  clear: "removeFormat",
  bullet: "insertUnorderedList",
  number: "insertOrderedList",
  indent: "indent",
  outdent: "outdent",
  undo: "undo",
  redo: "redo",
};

export function runEditorCommand(root: HTMLElement, cmd: EditorCommand): void {
  document.execCommand("styleWithCSS", false, "false");
  if (cmd.kind === "size") document.execCommand("fontSize", false, EDITOR_FONT_SIZE[cmd.size ?? "normal"]);
  else if (cmd.kind === "color") document.execCommand("foreColor", false, cmd.hex ? `#${cmd.hex}` : DEFAULT_COLOR_MARK);
  else document.execCommand(SIMPLE[cmd.kind]!, false);
  normalizeEditorDom(root);
}

/** Gỡ thẻ `<font>` đánh dấu "Trung bình" / "màu mặc định" (gọi sau mỗi lệnh và mỗi lần gõ) */
export function normalizeEditorDom(root: HTMLElement): void {
  // Trình duyệt hay để lại style="" rỗng sau khi gỡ màu / cỡ
  for (const el of [...root.querySelectorAll('[style=""]')]) el.removeAttribute("style");
  for (const font of [...root.querySelectorAll("font")]) {
    if (font.getAttribute("size") === NORMAL_SIZE) font.removeAttribute("size");
    if (colorToHex(font.getAttribute("color")) === DEFAULT_COLOR_MARK.slice(1)) font.removeAttribute("color");
    if (font.attributes.length === 0) font.replaceWith(...font.childNodes);
  }
}

/** Trạng thái các nút cho chỗ con trỏ đang đứng (nút nào sáng) */
export function readFormatState(root: HTMLElement): FormatState {
  const sel = window.getSelection();
  const anchor = sel?.anchorNode ?? null;
  if (!anchor || !root.contains(anchor)) return EMPTY_FORMAT;
  const q = (c: string) => {
    try {
      return document.queryCommandState(c);
    } catch {
      return false;
    }
  };
  let size: ZaloSize | null = null;
  let color: string | null = null;
  for (let n: Node | null = anchor; n && n !== root; n = n.parentNode) {
    if (!(n instanceof HTMLElement) || n.tagName !== "FONT") continue;
    if (size === null && n.hasAttribute("size")) size = sizeFromFontAttr(n.getAttribute("size"));
    const hex = colorToHex(n.getAttribute("color"));
    if (color === null && isZaloColor(hex)) color = hex;
  }
  return {
    bold: q("bold"),
    italic: q("italic"),
    underline: q("underline"),
    strike: q("strikeThrough"),
    bullet: q("insertUnorderedList"),
    number: q("insertOrderedList"),
    size,
    color,
  };
}

/** Con trỏ đang ở trong một mục danh sách (Shift+Enter tạo mục mới thay vì xuống dòng trong mục) */
export function caretInListItem(root: HTMLElement): boolean {
  const anchor = window.getSelection()?.anchorNode ?? null;
  const el = anchor instanceof Element ? anchor : anchor?.parentElement;
  const li = el?.closest("li");
  return !!li && root.contains(li);
}
