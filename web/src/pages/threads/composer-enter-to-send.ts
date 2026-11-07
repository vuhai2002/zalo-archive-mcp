/**
 * Phím trong ô soạn tin có phải lệnh gửi không, như Zalo: Enter gửi, Shift+Enter xuống dòng. Đang gõ dở bằng bộ gõ
 * (IME - `isComposing`, hoặc keyCode 229 ở trình duyệt cũ) thì Enter là chốt chữ, không gửi.
 */
export function isEnterToSend(e: { key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229;
}
