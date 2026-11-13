import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type Ref } from "react";
import { isEnterToSend } from "./composer-enter-to-send";
import { caretInListItem, normalizeEditorDom, readFormatState, runEditorCommand, type EditorCommand, type FormatState } from "./composer-editor-commands";
import { readRichContent, type NodeLike, type RichValue } from "./composer-rich-content-reader";
import { richValueToEditorHtml } from "./composer-rich-content-writer";

export type ComposerEditorHandle = {
  read: () => RichValue;
  clear: () => void;
  /** Đặt lại nội dung (gửi lỗi: trả chữ + định dạng về ô soạn) */
  setValue: (v: RichValue) => void;
  focus: () => void;
  run: (cmd: EditorCommand) => void;
};

/**
 * Ô soạn tin có định dạng (contenteditable). Enter gửi, Shift+Enter xuống dòng (trong danh sách: thêm mục), Ctrl+Shift+X bật /
 * tắt thanh định dạng như Zalo. Dán: có file / ảnh thì đưa ra ngoài (`onFiles`); bật định dạng thì giữ định dạng Zalo có (qua
 * bộ đọc + bộ ghi của kho, không chèn HTML lạ), tắt thì dán chữ trơn. Tắt định dạng thì Ctrl+B / I / U không làm gì.
 */
export function ComposerRichEditor({
  ref,
  formatOn,
  fill,
  placeholder,
  onEnterSend,
  onToggleFormat,
  onEscape,
  onFiles,
  onChange,
  onFormatState,
}: {
  ref: Ref<ComposerEditorHandle>;
  formatOn: boolean;
  /** Bật định dạng: ô chiếm hết khung cao cố định (khung lo chiều cao như Zalo); tắt: cao theo chữ, tối đa vài dòng */
  fill: boolean;
  placeholder: string;
  onEnterSend: () => void;
  onToggleFormat: () => void;
  /** Esc: trả true nếu đã xử lý (bỏ trả lời) */
  onEscape: () => boolean;
  onFiles: (files: File[]) => void;
  onChange: (v: { length: number; empty: boolean }) => void;
  onFormatState: (s: FormatState) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);

  const read = useCallback((): RichValue => (el.current ? readRichContent(el.current as unknown as NodeLike, { collapseWhitespace: false }) : { text: "", styles: [] }), []);
  const emitChange = useCallback(() => {
    const v = read();
    // Xóa hết chữ mà trình duyệt còn để lại <br> / thẻ rỗng: dọn sạch để placeholder hiện đúng
    if (!v.text && el.current && !el.current.querySelector("li") && el.current.innerHTML !== "") el.current.innerHTML = "";
    setEmpty(!v.text);
    onChange({ length: v.text.length, empty: !v.text });
  }, [onChange, read]);
  const emitState = useCallback(() => {
    if (el.current) onFormatState(readFormatState(el.current));
  }, [onFormatState]);

  useImperativeHandle(
    ref,
    () => ({
      read,
      clear: () => {
        if (el.current) el.current.innerHTML = "";
        emitChange();
      },
      setValue: (v) => {
        if (el.current) el.current.innerHTML = v.text ? richValueToEditorHtml(v) : "";
        emitChange();
      },
      focus: () => el.current?.focus(),
      run: (cmd) => {
        if (!el.current) return;
        el.current.focus();
        runEditorCommand(el.current, cmd);
        emitChange();
        emitState();
      },
    }),
    [read, emitChange, emitState],
  );

  // Nút sáng theo chỗ con trỏ đang đứng
  useEffect(() => {
    const onSel = () => emitState();
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [emitState]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === "x") {
      e.preventDefault();
      onToggleFormat();
      return;
    }
    if (!formatOn && (e.ctrlKey || e.metaKey) && !e.shiftKey && (k === "b" || k === "i" || k === "u")) {
      e.preventDefault();
      return;
    }
    if (e.key === "Escape" && onEscape()) {
      e.preventDefault();
      return;
    }
    if (formatOn && e.key === "Tab" && el.current && caretInListItem(el.current)) {
      e.preventDefault();
      runEditorCommand(el.current, { kind: e.shiftKey ? "outdent" : "indent" });
      emitChange();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (isEnterToSend({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode })) {
      onEnterSend();
      return;
    }
    document.execCommand(el.current && caretInListItem(el.current) ? "insertParagraph" : "insertLineBreak");
    emitChange();
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const files = [...e.clipboardData.files];
    if (files.length > 0) {
      onFiles(files);
      return;
    }
    const html = e.clipboardData.getData("text/html");
    if (formatOn && html) {
      const body = new DOMParser().parseFromString(html, "text/html").body;
      const value = readRichContent(body as unknown as NodeLike, { collapseWhitespace: true });
      if (value.text) document.execCommand("insertHTML", false, richValueToEditorHtml(value));
    } else {
      const text = e.clipboardData.getData("text/plain");
      if (text && el.current && !read().text) {
        // Ô đang trống: ghi thẳng chữ trơn. Lệnh insertText của trình duyệt sẽ áp "kiểu gõ" còn nhớ từ chữ vừa xóa (đậm, màu...)
        el.current.textContent = text.replace(/\r\n?/g, "\n");
        window.getSelection()?.selectAllChildren(el.current);
        window.getSelection()?.collapseToEnd();
      } else if (text) document.execCommand("insertText", false, text);
    }
    if (el.current) normalizeEditorDom(el.current);
    emitChange();
  }

  /** Kéo thả file vào ô soạn: như dán file. Kéo chữ thì để trình duyệt tự làm (chuyển chữ trong ô) */
  function onDrop(e: DragEvent<HTMLDivElement>) {
    const files = [...e.dataTransfer.files];
    if (files.length === 0) return;
    e.preventDefault();
    onFiles(files);
  }

  return (
    <div className={`relative min-w-0 flex-1 ${fill ? "min-h-0" : ""}`}>
      {empty && <div className="pointer-events-none absolute inset-x-0 top-0 select-none truncate text-[15px] leading-[1.5] text-ink-soft">{placeholder}</div>}
      <div
        ref={el}
        role="textbox"
        aria-multiline="true"
        aria-label="Nội dung tin nhắn"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onKeyDown={onKeyDown}
        onInput={() => {
          if (el.current) normalizeEditorDom(el.current);
          emitChange();
        }}
        onPaste={onPaste}
        onDrop={onDrop}
        onKeyUp={emitState}
        onMouseUp={emitState}
        className={`composer-rich-editor block min-h-[22.5px] w-full overflow-y-auto bg-transparent text-[15px] leading-[1.5] text-ink outline-none ${
          fill ? "h-full" : "max-h-[158px]"
        }`}
      />
    </div>
  );
}
