/**
 * Luật thuần cho việc tra số điện thoại trên Zalo (lookup_phones): chuẩn hóa số người dùng đưa vào, và đọc mã Zalo trả về.
 */

/**
 * Ký tự người ta hay chèn khi ghi số: khoảng trắng (cả dấu cách cứng), dấu chấm, ngoặc, mọi kiểu gạch (`\p{Pd}`), và ký tự
 * định dạng ẩn (`\p{Cf}`: dấu định hướng chữ, BOM) hay dính theo khi chép số từ danh bạ điện thoại / ứng dụng chat
 */
const SEPARATORS = /[\s.()\p{Pd}\p{Cf}]/gu;
/** Số di động Việt Nam sau tiền tố: 9 chữ số, bắt đầu bằng 3 / 5 / 7 / 8 / 9 (số bàn 02... bị loại) */
const MOBILE_SUBSCRIBER = /^[35789]\d{8}$/;

/**
 * Đưa số về dạng Zalo dùng khi tra: `84` + 9 chữ số. Nhận `0...`, `+84...`, `84...` và 9 chữ số trơn (Excel / form hay bỏ
 * mất số 0 đầu). Trả null khi không phải số di động Việt Nam: số bàn, thiếu / thừa chữ số, hai số trong một ô, có chữ.
 */
export function normalizeVnPhone(raw: string): string | null {
  const s = raw.replace(SEPARATORS, "");
  let subscriber: string;
  if (s.startsWith("+84")) subscriber = s.slice(3);
  else if (s.startsWith("84") && s.length === 11) subscriber = s.slice(2);
  else if (s.startsWith("0") && s.length === 10) subscriber = s.slice(1);
  else if (s.length === 9) subscriber = s;
  else return null;
  return MOBILE_SUBSCRIBER.test(subscriber) ? `84${subscriber}` : null;
}

/** Số đã chuẩn hóa hiện lại cho người đọc theo dạng quen thuộc 0xxxxxxxxx */
export const localPhone = (phone84: string) => `0${phone84.slice(2)}`;

/**
 * Mã Zalo trả khi số chưa có tài khoản, không cho tìm, hoặc tài khoản đó bị khóa (đo trên Zalo Web 2026-11-14; Zalo Web
 * hiện chung câu "Số điện thoại chưa đăng ký tài khoản hoặc không cho phép tìm kiếm"):
 * 216 "User không hợp lệ", 212 "Không tìm thấy", 210 "Người dùng này đã bị chặn do vi phạm chính sách của Zalo".
 */
export const NO_ZALO_CODES: readonly number[] = [216, 212, 210];

/** Mã lạ (có thể là Zalo chặn tra) thì "unknown": vòng tra tạm dừng chứ không ghi "không có Zalo" */
export function classifyLookupError(code: number | null): "no_zalo" | "unknown" {
  return code !== null && NO_ZALO_CODES.includes(code) ? "no_zalo" : "unknown";
}
