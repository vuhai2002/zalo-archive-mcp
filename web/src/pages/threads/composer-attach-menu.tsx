import { useEffect, useRef, useState } from "react";
import { IconZaloAttach, IconZaloFileOutline, IconZaloFolderOutline } from "../../shared/composer-zalo-style-icons";
import { ComposerToolButton } from "./composer-tool-button";

/**
 * Nút Đính kèm File như Zalo PC: bấm mở menu nhỏ ngay trên nút với 2 mục Chọn File / Chọn Thư mục (Zalo còn mục Chọn Sản
 * phẩm của cửa hàng - kho không có). Nút sáng nền khi menu đang mở; bấm ra ngoài hoặc Esc thì đóng.
 */
export function ComposerAttachMenu({ disabled, onPickFiles, onPickFolder }: { disabled: boolean; onPickFiles: () => void; onPickFolder: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const item = "flex h-10 w-full items-center gap-3 px-3 text-left text-[15px] text-ink hover:bg-[#e5e7eb] dark:hover:bg-tile";

  return (
    <div ref={box} className="relative">
      <ComposerToolButton title="Đính kèm File" active={open} disabled={disabled} onClick={() => setOpen((v) => !v)}>
        <IconZaloAttach size={24} />
      </ComposerToolButton>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-1 w-[165px] rounded-lg border border-black/[0.08] bg-surface py-1.5 shadow-[0_0_1px_rgba(21,39,71,0.3),0_8px_24px_rgba(21,39,71,0.15)] dark:border-line"
        >
          <button type="button" role="menuitem" className={item} onClick={() => pick(onPickFiles)}>
            <IconZaloFileOutline size={20} /> Chọn File
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => pick(onPickFolder)}>
            <IconZaloFolderOutline size={20} /> Chọn Thư mục
          </button>
        </div>
      )}
    </div>
  );
}
