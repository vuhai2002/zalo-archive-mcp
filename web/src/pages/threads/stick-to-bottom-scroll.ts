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

/** Kéo lên cách đáy hơn ngần này (cỡ vài tin) thì hiện nút về tin mới nhất, như Zalo */
export const JUMP_TO_LATEST_PX = 300;

/**
 * Người dùng đã kéo lên đọc tin cũ (cách đáy quá vài tin): hiện nút tròn "Tin mới nhất". Nút cũng luôn hiện khi
 * đoạn đang xem không chứa tin mới nhất (vừa nhảy tới một tin xa), kể cả ở cuối phần đã tải - việc đó khung tin tự xét.
 */
export function awayFromLatest(distanceFromBottom: number): boolean {
  return distanceFromBottom > JUMP_TO_LATEST_PX;
}
