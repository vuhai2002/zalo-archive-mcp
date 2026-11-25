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

export const envSchema = z
  .object({
    /** Thư mục dữ liệu, tương đối với gốc project nếu không phải đường dẫn tuyệt đối */
    DATA_DIR: z.string().min(1).default("./data"),
    ARCHIVE_TIMEZONE: z
      .string()
      .default("Asia/Ho_Chi_Minh")
      .refine((tz) => IANAZone.isValidZone(tz), "timezone IANA không hợp lệ"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    /**
     * KHÔNG cần đặt: khóa mã hóa cookie tự sinh ở data/app-secrets.json. Chỉ máy chạy bản
     * cũ (khóa nằm trong .env) mới để dòng này, để lần đầu app lấy đúng khóa cũ.
     */
    CREDENTIALS_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "phải là 64 ký tự hex")
      .optional(),

    // Nối lại listener
    RECONNECT_BASE_DELAY_SECONDS: int(5, 1, 3600),
    RECONNECT_MAX_DELAY_SECONDS: int(300, 1, 86400),
    RECONNECT_DUPLICATE_WAIT_MINUTES: int(15, 1, 1440),
    /** Lần 3000 đầu tiên (thường gặp lúc vừa mở máy) thử lại sau chừng này giây; bị lại mới chờ phút ở trên */
    RECONNECT_DUPLICATE_FIRST_RETRY_SECONDS: int(60, 5, 3600),
    RECONNECT_GIVE_UP_AFTER_FLAPS: int(8, 2, 100),

    // Đăng nhập Zalo (cookie hoặc QR) cách nhau tối thiểu bấy nhiêu giây: tránh đăng nhập dồn dập
    ZALO_LOGIN_COOLDOWN_SECONDS: int(30, 0, 3600),

    // Kết nối xong thì xin Zalo gửi bù tin lỡ (lúc tắt máy, lúc đang dùng nick khác).
    // Nối lại trong vòng bấy nhiêu phút kể từ lần xin trước thì không xin lại.
    OFFLINE_REPLAY_ENABLED: flag(true),
    OFFLINE_REPLAY_MIN_INTERVAL_MINUTES: int(10, 1, 1440),
    ZALO_KEEPALIVE_MINUTES: int(0, 0, 1440),
    // Đồng bộ danh sách bạn bè + tên gợi nhớ (giờ): Zalo không báo khi mình đổi tên gợi nhớ, nên hỏi lại định kỳ (3 lệnh nhẹ)
    DIRECTORY_SYNC_HOURS: int(1, 0, 168),
    // Hỏi hồ sơ người nhắn: mỗi lượt (50 người) cách nhau tối thiểu chừng này giây
    DIRECTORY_CONTACT_LOOKUP_GAP_SECONDS: int(60, 0, 3600),
    // Zalo báo hỏi quá nhiều (mã 221): nghỉ hỏi danh bạ chừng này phút, bị lại thì gấp đôi (tối đa 6 tiếng)
    DIRECTORY_RATE_LIMIT_PAUSE_MINUTES: int(30, 1, 360),

    // Tải media
    MEDIA_DOWNLOAD_ENABLED: flag(true),
    // Zalo cho gửi file tới 1 GB; trần thấp hơn thì video dài trong kho không bao giờ tải về
    MEDIA_MAX_MEGABYTES: int(1024, 1, 4096),
    MEDIA_MAX_ATTEMPTS: int(5, 1, 50),
    MEDIA_DOWNLOAD_TIMEOUT_MINUTES: int(15, 1, 240),
    // Ảnh gif chọn trong Zalo nằm ở media-ten.z-cdn.me (bản Zalo của Tenor), một số ở media.tenor.com:
    // chỉ cho đúng hai host này, không mở cả tên miền
    MEDIA_ALLOWED_HOST_SUFFIXES: z
      .string()
      .default("zdn.vn,zadn.vn,zalo.me,zaloapp.com,zalo.vn,dlfl.vn,flchat.vn,dlmd.me,mdchat.me,media-ten.z-cdn.me,media.tenor.com")
      .transform((s) =>
        s
          .split(",")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean),
      )
      .refine((list) => list.length > 0, "cần ít nhất một host"),
    // Link media hết hạn thì xin Zalo cấp lại (như Zalo Web), mỗi file một lần. Các lệnh
    // cách nhau ngẫu nhiên [MIN, MAX] giây, tối đa DAILY_CAP lệnh mỗi ngày - quá thì để ngày sau.
    MEDIA_RENEW_ENABLED: flag(true),
    MEDIA_RENEW_MIN_GAP_SECONDS: int(4, 1, 3600),
    MEDIA_RENEW_MAX_GAP_SECONDS: int(10, 1, 3600),
    MEDIA_RENEW_DAILY_CAP: int(200, 1, 10000),
    // File của tin cũ hơn chừng này ngày mà Zalo đã xóa (Zalo đã từ chối file cùng loại mới hơn) thì không
    // gọi máy chủ nữa: máy chủ không còn trả file quá ~30 ngày. 0 = luôn thử tải
    MEDIA_ASSUME_DELETED_AFTER_DAYS: int(40, 0, 3650),
    // Số luồng phụ đổi ảnh JPEG XL sang PNG (lúc tải ảnh JXL và lúc lấy từ Zalo PC). Mỗi ảnh lớn mất vài giây
    // một luồng; nhiều luồng thì lấy từ Zalo PC nhanh hơn nhưng chiếm thêm nhân CPU trong lúc chạy
    JXL_CONVERT_WORKERS: int(4, 1, 16),
    /**
     * Thư mục dữ liệu cục bộ của Zalo PC (chứa `<UID>\ZaloDownloads`) để lấy lại ảnh / video Zalo đã
     * xóa khỏi máy chủ. Bỏ trống = `%LOCALAPPDATA%\ZaloPC` (Windows tự có biến LOCALAPPDATA).
     */
    ZALO_PC_DATA_DIR: z.string().min(1).optional(),
    LOCALAPPDATA: z.string().min(1).optional(),

    // Cổng gửi - MẶC ĐỊNH (dashboard sửa được, phần sửa lưu trong DB và đè lên đây).
    // Tin lẻ: chỉ cách nhau tối thiểu vài giây. Lô (gửi nhiều người): nhịp ngẫu nhiên,
    // khung giờ + trần ngày riêng, gửi được tới cả người chưa kết bạn.
    SEND_SINGLE_MIN_GAP_SECONDS: int(3, 0, 3600),
    SEND_BATCH_MIN_GAP_SECONDS: int(45, 1, 7200),
    SEND_BATCH_MAX_GAP_SECONDS: int(180, 1, 7200),
    SEND_BATCH_WINDOW_START_HOUR: int(7, 0, 23),
    SEND_BATCH_WINDOW_END_HOUR: int(22, 1, 24),
    SEND_BATCH_DAILY_CAP: int(100, 0, 5000),
    SEND_BATCH_MAX_ITEMS: int(50, 1, 500),
    /** Tin hẹn giờ / đã duyệt trễ quá bấy nhiêu giờ so với giờ dự kiến thì bỏ, không gửi nữa */
    SEND_MAX_LATENESS_HOURS: int(12, 1, 720),
    // Tra số điện thoại trên Zalo (lookup_phones): tối đa mỗi ngày, nhịp ngẫu nhiên giữa hai lượt tra.
    // Chỉ tra trong khung giờ của lô.
    PHONE_LOOKUP_DAILY_CAP: int(100, 0, 1000),
    PHONE_LOOKUP_MIN_GAP_SECONDS: int(5, 1, 3600),
    PHONE_LOOKUP_MAX_GAP_SECONDS: int(20, 1, 3600),

    // Dashboard web (chạy cùng daemon). Mật khẩu tạo trên dashboard ở lần mở đầu tiên.
    DASHBOARD_HOST: z.string().min(1).default("127.0.0.1"),
    DASHBOARD_PORT: int(3210, 1, 65535),
    // Dashboard tự cập nhật (SSE): khi có tab đang mở, dò kho tìm tin / cảm xúc / file mới mỗi chừng này ms
    DASHBOARD_LIVE_CHECK_MS: int(1000, 200, 60_000),
    // Hỏi GitHub Release xem có bản mới không (dashboard hiện nút "Có bản mới", sync_status của MCP nhắc). Tắt = không hỏi
    UPDATE_CHECK_ENABLED: flag(true),
    UPDATE_CHECK_INTERVAL_HOURS: int(1, 1, 168),
  })
  .refine((e) => e.SEND_BATCH_MIN_GAP_SECONDS <= e.SEND_BATCH_MAX_GAP_SECONDS, {
    message: "SEND_BATCH_MIN_GAP_SECONDS phải <= SEND_BATCH_MAX_GAP_SECONDS",
    path: ["SEND_BATCH_MIN_GAP_SECONDS"],
  })
  .refine((e) => e.PHONE_LOOKUP_MIN_GAP_SECONDS <= e.PHONE_LOOKUP_MAX_GAP_SECONDS, {
    message: "PHONE_LOOKUP_MIN_GAP_SECONDS phải <= PHONE_LOOKUP_MAX_GAP_SECONDS",
    path: ["PHONE_LOOKUP_MIN_GAP_SECONDS"],
  })
  .refine((e) => e.SEND_BATCH_WINDOW_START_HOUR < e.SEND_BATCH_WINDOW_END_HOUR, {
    message: "SEND_BATCH_WINDOW_START_HOUR phải nhỏ hơn SEND_BATCH_WINDOW_END_HOUR",
    path: ["SEND_BATCH_WINDOW_START_HOUR"],
  })
  .refine((e) => e.RECONNECT_BASE_DELAY_SECONDS <= e.RECONNECT_MAX_DELAY_SECONDS, {
    message: "RECONNECT_BASE_DELAY_SECONDS phải <= RECONNECT_MAX_DELAY_SECONDS",
    path: ["RECONNECT_BASE_DELAY_SECONDS"],
  })
  .refine((e) => e.MEDIA_RENEW_MIN_GAP_SECONDS <= e.MEDIA_RENEW_MAX_GAP_SECONDS, {
    message: "MEDIA_RENEW_MIN_GAP_SECONDS phải <= MEDIA_RENEW_MAX_GAP_SECONDS",
    path: ["MEDIA_RENEW_MIN_GAP_SECONDS"],
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
