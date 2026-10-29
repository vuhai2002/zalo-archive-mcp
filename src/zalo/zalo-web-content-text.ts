/**
 * Chữ hiển thị cho tin "web content" của Zalo - thường là bài của tài khoản OA (quảng cáo, khuyến
 * mãi) gửi tới, app vẽ thành thẻ. Hai dạng đã thấy:
 * - `chat.webcontent`: `content.params` (chuỗi JSON) -> `item.bundle_data` (chuỗi JSON) -> `post`
 *   có `title` + `description`;
 * - `chat.webcontent.v2`: `content.zinstant_msg` (chuỗi JSON) -> `customMsg.msg.vi` (hoặc `en`).
 * Module thuần; không đọc được thì trả null để chỗ gọi để lại dấu vết `[msgType]`.
 */

function parseJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function webContentText(msgType: string, content: Record<string, unknown>): string | null {
  if (msgType === "chat.webcontent") {
    const item = parseJson(parseJson(content.params)?.item);
    const post = parseJson(parseJson(item?.bundle_data)?.post);
    const parts = [text(post?.title), text(post?.description)].filter(Boolean);
    return parts.length ? parts.join("\n") : null;
  }
  if (msgType === "chat.webcontent.v2") {
    const msg = parseJson(parseJson(parseJson(content.zinstant_msg)?.customMsg)?.msg);
    return text(msg?.vi) ?? text(msg?.en);
  }
  return null;
}
