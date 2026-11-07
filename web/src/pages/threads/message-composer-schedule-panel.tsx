import { BTN_PRIMARY } from "../../shared/ui-bits";

/** Ô chọn ngày + giờ gửi của nút Hẹn giờ trong khung soạn; giờ theo múi giờ của kho */
export function MessageComposerSchedulePanel({
  date,
  time,
  timeZone,
  canSubmit,
  onDate,
  onTime,
  onSubmit,
}: {
  date: string;
  time: string;
  timeZone: string;
  canSubmit: boolean;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-line bg-tile/40 px-4 py-2.5">
      <label className="text-[12px] text-ink-soft">
        Ngày
        <input type="date" value={date} onChange={(e) => onDate(e.target.value)} className="gc-input mt-1 block py-1.5" />
      </label>
      <label className="text-[12px] text-ink-soft">
        Giờ
        <input type="time" value={time} onChange={(e) => onTime(e.target.value)} className="gc-input mt-1 block py-1.5" />
      </label>
      <button type="button" className={BTN_PRIMARY} disabled={!canSubmit} onClick={onSubmit}>
        Đặt lịch gửi
      </button>
      <p className="basis-full text-[11px] text-ink-soft">Giờ theo múi giờ của kho ({timeZone}).</p>
    </div>
  );
}
