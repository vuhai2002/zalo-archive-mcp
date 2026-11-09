import { useCallback, useEffect, useState } from "react";

/**
 * Chế độ sáng/tối. Lựa chọn của người dùng lưu ở `localStorage`; chưa chọn lần
 * nào thì theo cài đặt hệ điều hành (`prefers-color-scheme`).
 *
 * Class `.dark` gắn trên `<html>` (không phải `<body>`) vì `styles.css` khai
 * `@custom-variant dark (&:where(.dark, .dark *))` - phải là tổ tiên của MỌI
 * phần tử, kể cả thứ render qua portal ra ngoài body.
 *
 * KHÔNG đặt giá trị khởi tạo bằng `useState(() => doc())` rồi mới ghi class ở
 * `useEffect`: giữa hai thời điểm đó trang đã vẽ một khung sáng rồi mới tối
 * lại, mắt thấy rõ cú nháy. Class được ghi ngay trong `index.html` trước khi
 * React chạy - hook này chỉ đọc lại trạng thái đã có.
 *
 * MỌI nơi gọi hook phải thấy CÙNG một giá trị (vd nút đổi theme và biểu tượng
 * mặt trời / mặt trăng ở chỗ khác). Nếu mỗi lần gọi tạo một `useState` riêng thì
 * bấm nút chỉ cập nhật state của nơi bấm - class trên `<html>` đổi nên màu (qua
 * token CSS) đổi ngay, nhưng phần React dựa vào `theme` vẫn giữ bản cũ tới khi
 * tải lại trang. Nên trạng thái để ở NGOÀI React và các hook đăng ký nhận thông
 * báo chung.
 */

export type Theme = "light" | "dark";
/** Lựa chọn trong Cài đặt > Giao diện như Zalo PC: sáng, tối, hoặc theo hệ điều hành (chưa / bỏ tự chọn) */
export type ThemeChoice = Theme | "system";

const KEY = "zalo-archive-theme";

/** Đọc trạng thái ĐANG hiệu lực từ chính DOM, không đoán lại từ localStorage */
function themeHienTai(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Mọi hook đang mounted - gọi hết khi theme đổi để chúng cùng re-render */
const nguoiTheoDoi = new Set<(t: Theme) => void>();

function phatTin(moi: Theme): void {
  for (const bao of nguoiTheoDoi) bao(moi);
}

/** Đổi theme: ghi DOM + localStorage rồi báo cho MỌI hook đang dùng */
function datTheme(moi: Theme): void {
  document.documentElement.classList.toggle("dark", moi === "dark");
  try {
    localStorage.setItem(KEY, moi);
  } catch {
    /* localStorage bị chặn (chế độ riêng tư): vẫn đổi được trong phiên này */
  }
  phatTin(moi);
}

/** Lựa chọn đang lưu: chưa tự chọn lần nào thì "system" */
function luaChonHienTai(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Theo hệ thống: bỏ lựa chọn đã lưu, áp ngay chế độ của hệ điều hành */
function theoHeThong(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* không xóa được thì thôi */
  }
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
  phatTin(dark ? "dark" : "light");
}

export function useTheme(): { theme: Theme; choice: ThemeChoice; toggle: () => void; choose: (c: ThemeChoice) => void } {
  const [theme, setTheme] = useState<Theme>(themeHienTai);

  // Đăng ký nhận thông báo khi BẤT KỲ nơi nào đổi theme
  useEffect(() => {
    nguoiTheoDoi.add(setTheme);
    // Có thể đã đổi giữa lúc component này đang mount - đồng bộ lại cho chắc
    setTheme(themeHienTai());
    return () => {
      nguoiTheoDoi.delete(setTheme);
    };
  }, []);

  const toggle = useCallback(() => {
    datTheme(themeHienTai() === "dark" ? "light" : "dark");
  }, []);
  const choose = useCallback((c: ThemeChoice) => (c === "system" ? theoHeThong() : datTheme(c)), []);

  /**
   * Người dùng đổi chế độ ở HỆ ĐIỀU HÀNH trong lúc đang mở tab: đổi theo, NHƯNG
   * chỉ khi họ chưa từng tự chọn trên dashboard - đã chọn tay rồi mà bị hệ điều
   * hành ghi đè thì cái nút kia thành vô nghĩa.
   */
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      let daChon: string | null = null;
      try {
        daChon = localStorage.getItem(KEY);
      } catch {
        /* không đọc được thì coi như chưa chọn */
      }
      if (daChon) return;
      const moi: Theme = e.matches ? "dark" : "light";
      document.documentElement.classList.toggle("dark", e.matches);
      phatTin(moi);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // "choice" đọc lại mỗi lần vẽ (theme đổi thì hook vẽ lại): lựa chọn nằm ở localStorage, không cần state riêng
  return { theme, choice: luaChonHienTai(), toggle, choose };
}
