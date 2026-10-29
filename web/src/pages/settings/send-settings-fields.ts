import type { SendSettings } from "../../archive-api-types";

export type SettingKey = keyof SendSettings;

export type SettingField = {
  key: SettingKey;
  label: string;
  help: string;
  unit: string;
  min: number;
  max: number;
  /** Ô giờ trong ngày - hiện bằng ô chọn "07:00" thay cho ô gõ số */
  hour?: boolean;
};

/**
 * Nhãn + giới hạn từng ô. Giới hạn chép theo schema phía server
 * (src/storage/send-settings-store.ts) chỉ để báo lỗi sớm ngay trên form; server
 * vẫn kiểm lại và câu lỗi 400 của nó luôn được hiện ra.
 */
export const SINGLE_FIELDS: SettingField[] = [
  {
    key: "singleMinGapSeconds",
    label: "Khoảng cách giữa hai tin lẻ",
    help: "Tin lẻ (gửi ngay, hẹn giờ, Claude gửi) cách nhau ít nhất bấy nhiêu giây.",
    unit: "giây",
    min: 0,
    max: 3600,
  },
  {
    key: "maxLatenessHours",
    label: "Bỏ tin trễ quá",
    help: "Tin hẹn giờ hoặc đã duyệt mà trễ quá ngần này (daemon tắt, đang khóa...) thì bỏ, không gửi muộn.",
    unit: "giờ",
    min: 1,
    max: 720,
  },
];

export const BATCH_FIELDS: SettingField[] = [
  {
    key: "batchMinGapSeconds",
    label: "Nhịp gửi lô - ngắn nhất",
    help: "Gửi nhiều người: mỗi tin cách tin trước một khoảng ngẫu nhiên giữa ngắn nhất và dài nhất.",
    unit: "giây",
    min: 1,
    max: 7200,
  },
  { key: "batchMaxGapSeconds", label: "Nhịp gửi lô - dài nhất", help: "Phải lớn hơn hoặc bằng nhịp ngắn nhất.", unit: "giây", min: 1, max: 7200 },
  {
    key: "batchWindowStartHour",
    label: "Khung giờ gửi lô - từ",
    help: "Lô chỉ gửi trong khung giờ này, theo múi giờ của kho. Ngoài khung thì chờ.",
    unit: "",
    min: 0,
    max: 23,
    hour: true,
  },
  { key: "batchWindowEndHour", label: "Khung giờ gửi lô - đến", help: "Giờ kết thúc, không tính giờ này.", unit: "", min: 1, max: 24, hour: true },
  {
    key: "batchDailyCap",
    label: "Trần tin lô mỗi ngày",
    help: "Tối đa số tin của lô trong một ngày; tin lẻ không tính. Đặt 0 là ngừng gửi lô.",
    unit: "tin",
    min: 0,
    max: 5000,
  },
  { key: "batchMaxItems", label: "Số người tối đa mỗi lô", help: "Một lần gửi nhiều người được tối đa ngần này người.", unit: "người", min: 1, max: 500 },
];

export const ALL_FIELDS = [...SINGLE_FIELDS, ...BATCH_FIELDS];

export type SettingsDraft = Record<SettingKey, string>;

export function toDraft(s: SendSettings): SettingsDraft {
  return Object.fromEntries(ALL_FIELDS.map((f) => [f.key, String(s[f.key])])) as SettingsDraft;
}

/** Kiểm form; trả lỗi theo từng ô (rỗng = hợp lệ) và bản số đã parse khi không có lỗi */
export function validateDraft(draft: SettingsDraft): { errors: Partial<Record<SettingKey, string>>; values: SendSettings | null } {
  const errors: Partial<Record<SettingKey, string>> = {};
  const values = {} as SendSettings;
  for (const f of ALL_FIELDS) {
    const raw = draft[f.key].trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n)) errors[f.key] = "Nhập số nguyên.";
    else if (n < f.min || n > f.max) errors[f.key] = `Trong khoảng ${f.min} - ${f.max}.`;
    else values[f.key] = n;
  }
  if (!errors.batchMinGapSeconds && !errors.batchMaxGapSeconds && values.batchMinGapSeconds > values.batchMaxGapSeconds) {
    errors.batchMaxGapSeconds = "Phải lớn hơn hoặc bằng nhịp ngắn nhất.";
  }
  if (!errors.batchWindowStartHour && !errors.batchWindowEndHour && values.batchWindowStartHour >= values.batchWindowEndHour) {
    errors.batchWindowEndHour = "Giờ kết thúc phải sau giờ bắt đầu.";
  }
  return { errors, values: Object.keys(errors).length === 0 ? values : null };
}

/** Chỉ gửi các ô đã đổi: PUT nhận Partial, gửi cả bộ thì ghi đè luôn những ô người dùng không đụng tới */
export function changedFields(saved: SendSettings, next: SendSettings): Partial<SendSettings> {
  const patch: Partial<SendSettings> = {};
  for (const f of ALL_FIELDS) if (saved[f.key] !== next[f.key]) patch[f.key] = next[f.key];
  return patch;
}
