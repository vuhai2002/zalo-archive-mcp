/** Cách đáy dưới ngần này coi như "đang đọc tin mới nhất" - ảnh tải xong thì kéo theo xuống đáy */
export const STICK_PX = 80;

/**
 * Cờ "bám đáy" sau một lần cuộn của khung chat. Chỉ người dùng kéo LÊN mới thôi bám đáy. Ảnh / video ở cuối
 * đã biết cỡ nhưng chưa tải xong làm khung dãn ra mà vị trí cuộn không đổi; nếu đúng lúc đó sự kiện cuộn (của
 * lần kéo xuống đáy trước) đo thấy "cách đáy xa" rồi tắt cờ, thì ảnh tải xong không kéo xuống nữa và tin mới
 * nhất bị đẩy khỏi màn hình.
 */
export function nextStickToBottom(o: {
  stick: boolean;
  /** Đang xem phần mới nhất của hội thoại (không phải đoạn cũ vừa nhảy tới) */
  atLatest: boolean;
  scrollTop: number;
  prevScrollTop: number;
  distanceFromBottom: number;
}): boolean {
  if (o.distanceFromBottom < STICK_PX) return o.atLatest;
  return o.scrollTop < o.prevScrollTop ? false : o.stick;
}
