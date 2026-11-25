/**
 * Prompt người dùng chép đưa cho agent (Claude Code...) để tự cập nhật kho - nguyên văn người dùng chốt. Chỉ trỏ về mục
 * "Cập nhật" trong README: đổi cách cập nhật thì sửa README, prompt cũ vẫn dùng được.
 */
export const APP_UPDATE_AGENT_PROMPT =
  'Cập nhật Zalo Archive MCP lên bản mới nhất, làm đúng theo mục "Cập nhật" trong README.md của repo. Có file code bị sửa ' +
  "tay thì dừng lại hỏi tôi, không ghi đè. Không xóa hay sửa gì trong thư mục data/. Xong thì nối lại MCP zalo-archive và " +
  "báo tôi đã lên bản nào, có gì mới.";

/** Dashboard hỏi lại bản mới mỗi chừng này (máy chủ đã cache theo nhịp của nó, hỏi dày cũng không gọi GitHub thêm) */
export const APP_UPDATE_POLL_MS = 60 * 60_000;
