/** Khoảng chừa phía trên khi canh đầu một tin dài sát mép khung chat */
const TOP_GAP_PX = 12;
/** Tin cao quá chừng này so với khung thì canh đầu tin thay vì canh giữa */
const TALL_RATIO = 0.85;

/**
 * Vị trí cuộn để thấy một tin vừa nhảy tới: tin ngắn nằm giữa khung; tin cao gần bằng hoặc hơn khung (vd tin báo cáo
 * dài kèm thẻ link) thì đầu tin sát mép trên - canh giữa thì đầu tin khuất lên trên, người đọc chỉ thấy khúc giữa.
 * `itemTop` / `rootTop`: vị trí trên màn hình (getBoundingClientRect), `scrollTop`: vị trí cuộn hiện tại.
 */
export function jumpScrollTop(o: { itemTop: number; itemHeight: number; rootTop: number; rootHeight: number; scrollTop: number }): number {
  const offset = o.itemTop - o.rootTop;
  const target = o.itemHeight > o.rootHeight * TALL_RATIO ? offset - TOP_GAP_PX : offset - (o.rootHeight - o.itemHeight) / 2;
  return Math.max(0, Math.round(o.scrollTop + target));
}
