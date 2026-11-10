import { useEffect, useState } from "react";

/**
 * Chiều cao hiện tại (px) của một phần tử, cập nhật khi nó đổi cỡ; null khi chưa có phần tử. Nhận chính phần tử (lấy qua ref
 * dạng hàm: `ref={setEl}`) để đo được cả phần tử chỉ hiện ra sau khi dữ liệu tải xong.
 */
export function useElementHeight(el: HTMLElement | null): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!el) return setHeight(null);
    const measure = () => setHeight(Math.round(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return height;
}
