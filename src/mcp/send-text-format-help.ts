/**
 * Hướng dẫn cú pháp định dạng chữ cho các lệnh gửi của MCP (send_message, schedule_message, draft_message, chữ của send_file).
 * Kho đổi cú pháp này sang thanh Định dạng tin nhắn của Zalo: src/outbox/markdown-to-zalo-styles.ts.
 */
export const FORMAT_HELP =
  "Định dạng (tùy chọn, như thanh Định dạng tin nhắn của Zalo): **đậm**, *nghiêng*, ~~gạch ngang~~, <u>gạch chân</u>, màu " +
  "<red>...</red> <orange> <yellow> <green>, cỡ chữ <small> (nhỏ) <big> (lớn) <huge> (rất lớn); dòng bắt đầu '- ' là gạch đầu " +
  "dòng, '1. ' là đánh số, thụt thêm khoảng trắng trước dấu đó = mục con. Viết \\* nếu cần dấu sao thật. Không dùng dấu nào " +
  "thì gửi chữ thường.";
