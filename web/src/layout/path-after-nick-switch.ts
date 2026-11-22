/**
 * Đổi nick xong thì trang đang mở có còn dùng được không: đường dẫn hội thoại (`/threads/<mã>`, cả `?msg=`) mang mã hội thoại
 * của nick cũ - nick mới không có hội thoại đó, nên về danh sách hội thoại. Trang khác (Tổng quan, Hàng đợi...) tự tải lại
 * theo nick mới nên giữ nguyên. Trả đường dẫn cần chuyển tới, null = giữ nguyên.
 */
export function pathAfterNickSwitch(pathname: string): string | null {
  return /^\/threads\/[^/]+/.test(pathname) ? "/threads" : null;
}
