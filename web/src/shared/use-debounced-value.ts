import { useEffect, useState } from "react";

/** Giá trị trễ `delayMs` sau lần đổi cuối - ô tìm kiếm không bắn một request mỗi phím gõ */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
