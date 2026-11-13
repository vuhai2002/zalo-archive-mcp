import { IconClock, IconFileText } from "../../shared/action-and-media-icons";
import { IconZaloAttach, IconZaloPhoto, IconZaloTextFormat } from "../../shared/composer-zalo-style-icons";
import { ComposerToolButton } from "./composer-tool-button";

/**
 * Hàng công cụ phía trên ô soạn, thứ tự như Zalo PC: Gửi hình ảnh, Đính kèm File, Định dạng tin nhắn; rồi Hẹn giờ, Lưu nháp của
 * kho. Số đo như Zalo Web: nút 32x32 cách nhau 12px, icon 24px, lề trái 8px, lề trên / dưới 4px.
 */
export function ComposerTopToolbar(p: {
  busy: boolean;
  draftBusy: boolean;
  canSubmit: boolean;
  formatOn: boolean;
  scheduleOpen: boolean;
  length: number;
  maxLength: number;
  onPhoto: () => void;
  onFile: () => void;
  onToggleFormat: () => void;
  onSchedule: () => void;
  onDraft: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-2 py-1">
      <ComposerToolButton title="Gửi hình ảnh" disabled={p.busy} onClick={p.onPhoto}>
        <IconZaloPhoto size={24} />
      </ComposerToolButton>
      <ComposerToolButton title="Đính kèm File" disabled={p.busy} onClick={p.onFile}>
        <IconZaloAttach size={24} />
      </ComposerToolButton>
      <ComposerToolButton title="Định dạng tin nhắn (Ctrl + Shift + X)" active={p.formatOn} onClick={p.onToggleFormat}>
        <IconZaloTextFormat size={24} />
      </ComposerToolButton>
      <ComposerToolButton title="Hẹn giờ gửi tin này" active={p.scheduleOpen} disabled={p.busy} onClick={p.onSchedule}>
        <IconClock size={24} />
      </ComposerToolButton>
      <ComposerToolButton title={p.draftBusy ? "Đang lưu nháp..." : "Lưu nháp: vào hàng đợi, chưa gửi"} disabled={!p.canSubmit} onClick={p.onDraft}>
        <IconFileText size={24} />
      </ComposerToolButton>
      {/* Bộ đếm chỉ có ích khi gần chạm trần */}
      {p.length > p.maxLength * 0.8 && (
        <span className={`ml-auto pr-2 text-[11px] tabular-nums ${p.length > p.maxLength ? "text-red-600" : "text-ink-soft"}`}>
          {p.length}/{p.maxLength} ký tự
        </span>
      )}
    </div>
  );
}
