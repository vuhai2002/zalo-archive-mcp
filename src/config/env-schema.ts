import { IANAZone } from "luxon";
import { z } from "zod";

/**
 * Schema biến môi trường. Module THUẦN: chỉ parse một object nguồn, không đọc
 * `process.env`, không đọc file - để test truyền nguồn giả vào được.
 *
 * Mọi núm chỉnh vận hành (trần gửi, nhịp, khung giờ, thời gian chờ nối lại...)
 * đều nằm ở đây với giá trị mặc định AN TOÀN, để chỉnh sau khi chạy thật mà
 * không phải sửa code.
 */

/** `z.coerce.boolean()` coi chuỗi "false" là true - phải tự parse */
const flag = (defaultValue: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .default(defaultValue ? "true" : "false")
    .transform((v) => v === "true" || v === "1");

const int = (defaultValue: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(defaultValue);

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/;

export const envSchema = z
  .object({
    /** Tên thư mục account trong DATA_DIR (kebab-case), vd nick-phu, nick-chinh */
    ZALO_ACCOUNT_ID: z.string().regex(ACCOUNT_ID_PATTERN, "chỉ chữ thường, số, gạch ngang"),
    /** Thư mục dữ liệu, tương đối với gốc project nếu không phải đường dẫn tuyệt đối */
    DATA_DIR: z.string().min(1).default("./data"),
    ARCHIVE_TIMEZONE: z
      .string()
      .default("Asia/Ho_Chi_Minh")
      .refine((tz) => IANAZone.isValidZone(tz), "timezone IANA không hợp lệ"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    /** 64 ký tự hex (32 byte). Chỉ bắt buộc với lệnh đăng nhập và daemon, MCP không cần */
    CREDENTIALS_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "phải là 64 ký tự hex")
      .optional(),

    // Nối lại listener
    RECONNECT_BASE_DELAY_SECONDS: int(5, 1, 3600),
    RECONNECT_MAX_DELAY_SECONDS: int(300, 1, 86400),
    RECONNECT_DUPLICATE_WAIT_MINUTES: int(15, 1, 1440),
    RECONNECT_GIVE_UP_AFTER_FLAPS: int(8, 2, 100),

    // Phần còn chờ số đo thật: mặc định tắt
    OFFLINE_REPLAY_ENABLED: flag(false),
    ZALO_KEEPALIVE_MINUTES: int(0, 0, 1440),
    DIRECTORY_SYNC_HOURS: int(12, 0, 168),

    // Tải media
    MEDIA_DOWNLOAD_ENABLED: flag(true),
    MEDIA_MAX_MEGABYTES: int(200, 1, 4096),
    MEDIA_MAX_ATTEMPTS: int(5, 1, 50),
    MEDIA_DOWNLOAD_TIMEOUT_MINUTES: int(15, 1, 240),
    MEDIA_ALLOWED_HOST_SUFFIXES: z
      .string()
      .default("zdn.vn,zadn.vn,zalo.me,zaloapp.com,zalo.vn,dlfl.vn,flchat.vn")
      .transform((s) =>
        s
          .split(",")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean),
      )
      .refine((list) => list.length > 0, "cần ít nhất một host"),

    // Cổng gửi - MẶC ĐỊNH (dashboard sửa được, phần sửa lưu trong DB và đè lên đây).
    // Tin lẻ: chỉ cách nhau tối thiểu vài giây. Lô (gửi nhiều người): nhịp ngẫu nhiên,
    // chỉ bạn bè, khung giờ + trần ngày riêng.
    SEND_SINGLE_MIN_GAP_SECONDS: int(3, 0, 3600),
    SEND_BATCH_MIN_GAP_SECONDS: int(45, 1, 7200),
    SEND_BATCH_MAX_GAP_SECONDS: int(180, 1, 7200),
    SEND_BATCH_WINDOW_START_HOUR: int(7, 0, 23),
    SEND_BATCH_WINDOW_END_HOUR: int(22, 1, 24),
    SEND_BATCH_DAILY_CAP: int(100, 0, 5000),
    SEND_BATCH_MAX_ITEMS: int(50, 1, 500),
    /** Tin hẹn giờ / đã duyệt trễ quá bấy nhiêu giờ so với giờ dự kiến thì bỏ, không gửi nữa */
    SEND_MAX_LATENESS_HOURS: int(12, 1, 720),

    // Dashboard web (chạy cùng daemon). Không đặt mật khẩu thì dashboard không mở.
    DASHBOARD_HOST: z.string().min(1).default("127.0.0.1"),
    DASHBOARD_PORT: int(3210, 1, 65535),
    DASHBOARD_PASSWORD: z.string().min(8, "tối thiểu 8 ký tự").optional(),
  })
  .refine((e) => e.SEND_BATCH_MIN_GAP_SECONDS <= e.SEND_BATCH_MAX_GAP_SECONDS, {
    message: "SEND_BATCH_MIN_GAP_SECONDS phải <= SEND_BATCH_MAX_GAP_SECONDS",
    path: ["SEND_BATCH_MIN_GAP_SECONDS"],
  })
  .refine((e) => e.SEND_BATCH_WINDOW_START_HOUR < e.SEND_BATCH_WINDOW_END_HOUR, {
    message: "SEND_BATCH_WINDOW_START_HOUR phải nhỏ hơn SEND_BATCH_WINDOW_END_HOUR",
    path: ["SEND_BATCH_WINDOW_START_HOUR"],
  })
  .refine((e) => e.RECONNECT_BASE_DELAY_SECONDS <= e.RECONNECT_MAX_DELAY_SECONDS, {
    message: "RECONNECT_BASE_DELAY_SECONDS phải <= RECONNECT_MAX_DELAY_SECONDS",
    path: ["RECONNECT_BASE_DELAY_SECONDS"],
  });

export type AppEnv = z.infer<typeof envSchema>;

/** Parse nguồn biến môi trường; sai thì ném lỗi liệt kê đủ từng biến hỏng */
export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  // Chuỗi rỗng coi như chưa đặt, để `.default()` có tác dụng với dòng `KEY=` trong .env
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Cấu hình .env không hợp lệ:\n${lines.join("\n")}`);
  }
  return result.data;
}
