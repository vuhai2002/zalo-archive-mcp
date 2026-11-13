import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck } from "../../shared/dashboard-icons";
import {
  IconZaloBold,
  IconZaloBulletList,
  IconZaloEraser,
  IconZaloExpand,
  IconZaloFontSize,
  IconZaloIndent,
  IconZaloItalic,
  IconZaloNumberList,
  IconZaloOutdent,
  IconZaloRedo,
  IconZaloStrike,
  IconZaloTextColor,
  IconZaloUnderline,
  IconZaloUndo,
} from "../../shared/composer-zalo-style-icons";
import type { EditorCommand, FormatState } from "./composer-editor-commands";
import { SIZE_PX, ZALO_COLORS, ZALO_SIZES } from "./composer-zalo-format";

/** Bóng của menu nổi, như popover của Zalo Web */
const POPOVER = "rounded-lg border border-black/[0.08] bg-surface shadow-[0_0_1px_rgba(21,39,71,0.3),0_8px_24px_rgba(21,39,71,0.15)] dark:border-line";

/**
 * Thanh "Định dạng tin nhắn" dưới ô soạn, theo số đo trên Zalo Web: nút 30x30 bo 3px cách nhau 4px, icon 20px, vạch ngăn 1x20
 * trước nút Mở rộng. Menu Cỡ chữ (rộng 153px, mục cao 36px) hiện mỗi mục bằng đúng cỡ chữ của nó; menu Màu là 5 ô vuông 20x20
 * cách 8px, ô đang chọn viền xanh 2px. Menu nằm sát ngay trên nút. Mọi nút chặn mousedown để vùng chữ đang chọn không mất.
 * `trailing`: nút bên phải cùng hàng (nút gửi), như Zalo dời nút xuống hàng này khi bật định dạng.
 */
export function ComposerFormatToolbar({
  state,
  expanded,
  onCommand,
  onToggleExpand,
  trailing,
}: {
  state: FormatState;
  expanded: boolean;
  onCommand: (cmd: EditorCommand) => void;
  onToggleExpand: () => void;
  trailing?: ReactNode;
}) {
  const [menu, setMenu] = useState<"size" | "color" | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const run = (cmd: EditorCommand) => {
    setMenu(null);
    onCommand(cmd);
  };

  return (
    <div ref={box} className="flex items-center gap-1" role="toolbar" aria-label="Định dạng tin nhắn">
      <FmtButton title="In đậm" active={state.bold} onClick={() => run({ kind: "bold" })}>
        <IconZaloBold size={20} />
      </FmtButton>
      <FmtButton title="In nghiêng" active={state.italic} onClick={() => run({ kind: "italic" })}>
        <IconZaloItalic size={20} />
      </FmtButton>
      <FmtButton title="Gạch chân" active={state.underline} onClick={() => run({ kind: "underline" })}>
        <IconZaloUnderline size={20} />
      </FmtButton>
      <FmtButton title="Gạch ngang chữ" active={state.strike} onClick={() => run({ kind: "strike" })}>
        <IconZaloStrike size={20} />
      </FmtButton>
      <div className="relative">
        <FmtButton title="Cỡ chữ" active={menu === "size"} onClick={() => setMenu(menu === "size" ? null : "size")}>
          <IconZaloFontSize size={20} />
        </FmtButton>
        {menu === "size" && (
          <div className={`absolute bottom-full left-0 z-20 w-[153px] px-1.5 py-3.5 ${POPOVER}`} role="menu">
            {ZALO_SIZES.map((s) => (
              <button
                key={s.label}
                type="button"
                role="menuitemradio"
                aria-checked={state.size === s.size}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run({ kind: "size", size: s.size })}
                className="flex h-9 w-full items-center justify-between rounded px-2.5 text-left leading-[1.5] text-ink hover:bg-[#e5e7eb] dark:hover:bg-tile"
                style={{ fontSize: s.size ? SIZE_PX[s.size] : 15 }}
              >
                {s.label}
                {state.size === s.size && <IconCheck size={20} className="text-[#005ae0] dark:text-zalo-500" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative">
        <FmtButton title="Đổi màu chữ" active={menu === "color"} onClick={() => setMenu(menu === "color" ? null : "color")}>
          {/* Chưa chọn màu: vạch theo màu chữ chính (giao diện sáng thì gần đúng màu mặc định của Zalo, giao diện tối vẫn thấy) */}
          <IconZaloTextColor size={20} color={state.color ? `#${state.color}` : undefined} />
        </FmtButton>
        {menu === "color" && (
          <div className={`absolute bottom-full left-0 z-20 flex gap-2 p-2 ${POPOVER}`} role="menu">
            {[...ZALO_COLORS.map((c) => ({ hex: c.hex as string | null, label: c.label })), { hex: null, label: "Màu mặc định" }].map((c) => (
              <button
                key={c.label}
                type="button"
                role="menuitemradio"
                title={c.label}
                aria-label={c.label}
                aria-checked={state.color === c.hex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run({ kind: "color", hex: c.hex })}
                className={`h-5 w-5 rounded-[2px] ${c.hex ? "" : "bg-[#050a19] dark:bg-ink"} ${state.color === c.hex ? "border-2 border-[#66a6ff]" : ""}`}
                style={c.hex ? { backgroundColor: `#${c.hex}` } : undefined}
              />
            ))}
          </div>
        )}
      </div>
      <FmtButton title="Bỏ tất cả định dạng" onClick={() => run({ kind: "clear" })}>
        <IconZaloEraser size={20} />
      </FmtButton>
      <FmtButton title="Gạch đầu dòng" active={state.bullet} onClick={() => run({ kind: "bullet" })}>
        <IconZaloBulletList size={20} />
      </FmtButton>
      <FmtButton title="Đánh số" active={state.number} onClick={() => run({ kind: "number" })}>
        <IconZaloNumberList size={20} />
      </FmtButton>
      <FmtButton title="Thụt lề" onClick={() => run({ kind: "indent" })}>
        <IconZaloIndent size={20} />
      </FmtButton>
      <FmtButton title="Bỏ thụt lề" onClick={() => run({ kind: "outdent" })}>
        <IconZaloOutdent size={20} />
      </FmtButton>
      <FmtButton title="Hoàn tác" onClick={() => run({ kind: "undo" })}>
        <IconZaloUndo size={20} />
      </FmtButton>
      <FmtButton title="Khôi phục hoàn tác" onClick={() => run({ kind: "redo" })}>
        <IconZaloRedo size={20} />
      </FmtButton>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      <FmtButton title="Mở rộng" active={expanded} onClick={onToggleExpand}>
        <IconZaloExpand size={20} />
      </FmtButton>
      {trailing && <div className="ml-auto flex items-center">{trailing}</div>}
    </div>
  );
}

/** Nút 30x30 bo 3px như Zalo; đang bật: nền xanh nhạt, icon xanh; rê chuột: nền xám nhạt */
function FmtButton({ title, active = false, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[3px] ${
        active ? "bg-[#e5f1ff] text-[#005ae0] dark:bg-zalo-500/15 dark:text-zalo-500" : "text-ink hover:bg-[#e5e7eb] dark:hover:bg-tile"
      }`}
    >
      {children}
    </button>
  );
}
