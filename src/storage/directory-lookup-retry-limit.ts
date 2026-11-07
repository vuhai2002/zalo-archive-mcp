/**
 * Hỏi Zalo tên / avatar người hoặc nhóm mà không ra (Zalo không trả hồ sơ / nhóm, trả hồ sơ trống, hoặc báo lỗi):
 * hỏi lại sau một ngày, tổng cộng tối đa ngần này lần rồi thôi - tài khoản đã xóa / bị khóa, nhóm đã rời / giải
 * tán thì hỏi mãi cũng không ra, chỉ thêm lệnh gọi Zalo vô ích. Zalo trả thông tin là xong (đếm về 0).
 */
export const MAX_LOOKUP_ATTEMPTS = 3;
