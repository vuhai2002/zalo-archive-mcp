/**
 * Chữ gõ ở ô Tìm kiếm có phải số di động Việt Nam không (0xxxxxxxxx, 84xxxxxxxxx, +84..., có dấu cách / chấm / gạch xen giữa
 * cũng được). Trả dạng 0xxxxxxxxx; không phải thì null. Máy chủ kiểm lại khi tra.
 */
export function phoneInQuery(q: string): string | null {
  const s = q.replace(/[\s.\-()]/g, "");
  const m = /^(?:\+?84|0)?([35789]\d{8})$/.exec(s);
  return m ? `0${m[1]}` : null;
}
