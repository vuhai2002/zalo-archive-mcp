import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { AppEnv } from "../config/env-schema.js";
import { getMeta, setMeta } from "./thread-directory-store.js";

/**
 * Cài đặt cổng gửi. Mặc định lấy từ `.env`; người dùng sửa trên dashboard thì
 * phần sửa lưu vào DB (`meta.send_settings`) và ĐÈ mặc định. Daemon đọc lại mỗi
 * lượt gửi nên sửa có hiệu lực ngay, không phải khởi động lại.
 */
const hour = z.number().int().min(0).max(24);

export const sendSettingsSchema = z
  .object({
    singleMinGapSeconds: z.number().int().min(0).max(3600),
    batchMinGapSeconds: z.number().int().min(1).max(7200),
    batchMaxGapSeconds: z.number().int().min(1).max(7200),
    batchWindowStartHour: hour,
    batchWindowEndHour: hour,
    batchDailyCap: z.number().int().min(0).max(5000),
    batchMaxItems: z.number().int().min(1).max(500),
    maxLatenessHours: z.number().int().min(1).max(720),
  })
  .refine((s) => s.batchMinGapSeconds <= s.batchMaxGapSeconds, {
    message: "Nhịp tối thiểu của lô phải <= nhịp tối đa",
    path: ["batchMinGapSeconds"],
  })
  .refine((s) => s.batchWindowStartHour < s.batchWindowEndHour, {
    message: "Giờ bắt đầu khung gửi lô phải nhỏ hơn giờ kết thúc",
    path: ["batchWindowStartHour"],
  });

export type SendSettings = z.infer<typeof sendSettingsSchema>;

const META_KEY = "send_settings";

export function defaultSendSettings(env: AppEnv): SendSettings {
  return {
    singleMinGapSeconds: env.SEND_SINGLE_MIN_GAP_SECONDS,
    batchMinGapSeconds: env.SEND_BATCH_MIN_GAP_SECONDS,
    batchMaxGapSeconds: env.SEND_BATCH_MAX_GAP_SECONDS,
    batchWindowStartHour: env.SEND_BATCH_WINDOW_START_HOUR,
    batchWindowEndHour: env.SEND_BATCH_WINDOW_END_HOUR,
    batchDailyCap: env.SEND_BATCH_DAILY_CAP,
    batchMaxItems: env.SEND_BATCH_MAX_ITEMS,
    maxLatenessHours: env.SEND_MAX_LATENESS_HOURS,
  };
}

/** Cài đặt đang hiệu lực. Phần lưu trong DB hỏng thì bỏ qua, dùng mặc định (không làm chết vòng gửi). */
export function getSendSettings(db: DatabaseSync, env: AppEnv): SendSettings {
  const defaults = defaultSendSettings(env);
  const raw = getMeta(db, META_KEY);
  if (!raw) return defaults;
  try {
    const merged = { ...defaults, ...(JSON.parse(raw) as Partial<SendSettings>) };
    const parsed = sendSettingsSchema.safeParse(merged);
    return parsed.success ? parsed.data : defaults;
  } catch {
    return defaults;
  }
}

/** Ghi phần sửa. Sai thì trả câu lỗi tiếng Việt, không ghi gì. */
export function updateSendSettings(
  db: DatabaseSync,
  env: AppEnv,
  patch: Partial<SendSettings>,
): { ok: true; settings: SendSettings } | { ok: false; error: string } {
  const parsed = sendSettingsSchema.safeParse({ ...getSendSettings(db, env), ...patch });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  setMeta(db, META_KEY, JSON.stringify(parsed.data));
  return { ok: true, settings: parsed.data };
}
