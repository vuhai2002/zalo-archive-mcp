/**
 * Xếp chùm ảnh (album) như Zalo PC - chép thuật toán và cấu hình mặc định `media_group_layout` của Zalo PC
 * 26.11.10: khung rộng 450px, hàng nhắm cao 180px, khe 2px; chia ảnh thành các hàng "đều" nhau (chia dãy tỉ lệ
 * sao cho hàng nặng nhất nhẹ nhất), ảnh trong một hàng cùng chiều cao và lấp đủ chiều rộng theo tỉ lệ ảnh - nên
 * gần như không cắt ảnh. Ảnh quá dọc / quá ngang có khung tỉ lệ riêng và hiện nguyên ảnh (contain). Hơn 10 ảnh thì
 * lưới ô vuông 90px. Bố cục tính ở bề rộng 450px; nơi vẽ thu nhỏ theo chỗ trống (`albumScale`).
 */
export type AlbumPhotoSize = { width: number | null; height: number | null };
/** Bo góc theo thứ tự trên-trái, trên-phải, dưới-phải, dưới-trái (chỉ góc ngoài của khung) */
export type AlbumCell = { x: number; y: number; width: number; height: number; fit: "cover" | "contain"; radius: [number, number, number, number] };
export type AlbumLayout = { width: number; height: number; cells: AlbumCell[] };

export const ALBUM_WIDTH = 450;
/** Khung không nhỏ hơn chừng này dù chỗ hẹp (Zalo PC) */
export const ALBUM_MIN_WIDTH = 270;
const TARGET_HEIGHT = 180;
const SPACING = 2;
const RADIUS = 8;
const LOWER_RATIO = 0.32;
const LOWER_CROP_RATIO = 0.36;
const UPPER_RATIO = 4;
const UPPER_CROP_RATIO = 2.75;
const SQUARE_LAYOUT_FROM = 11;
const SQUARE_CELL = 90;
const FIT_LOSS = 30;
const MIN_ITEM_WIDTH = 88;
const MIN_ROW_HEIGHT = 68;
/** Hàng cao hơn mức này (vd một ảnh dọc đứng riêng) thì gộp với hàng sau, hoặc ép về CLAMPED_ROW_HEIGHT */
const TALL_ROW = 550;
const CLAMPED_ROW_HEIGHT = 250;
const MAX_MERGED_ROW = 3;

/** Tỉ lệ ngang / dọc của ảnh; không biết cỡ thì coi như ảnh vuông */
const ratioOf = (p: AlbumPhotoSize) => (p.width && p.height ? p.width / p.height : 1);

/**
 * Chia dãy `seq` (giữ thứ tự) thành `k` đoạn sao cho tổng của đoạn lớn nhất là nhỏ nhất - bài "linear partition"
 * quen thuộc của lưới ảnh; cùng cách chọn khi hòa như Zalo (lấy điểm cắt đầu tiên).
 */
export function linearPartition(seq: number[], k: number): number[][] {
  const n = seq.length;
  if (k <= 0) return [];
  if (k > n) return seq.map((x) => [x]);
  const table = seq.map(() => new Array<number>(k).fill(0));
  const cut = seq.slice(1).map(() => new Array<number>(Math.max(k - 1, 0)).fill(0));
  for (let i = 0; i < n; i++) table[i]![0] = seq[i]! + (i ? table[i - 1]![0]! : 0);
  for (let j = 0; j < k; j++) table[0]![j] = seq[0]!;
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < k; j++) {
      let best = Infinity;
      let at = 0;
      for (let x = 0; x < i; x++) {
        const cost = Math.max(table[x]![j - 1]!, table[i]![0]! - table[x]![0]!);
        if (x === 0 || cost < best) {
          best = cost;
          at = x;
        }
      }
      table[i]![j] = best;
      cut[i - 1]![j - 1] = at;
    }
  }
  const parts: number[][] = [];
  let end = n - 1;
  for (let j = k - 2; j >= 0; j--) {
    const start = cut[end - 1]![j]!;
    parts.unshift(seq.slice(start + 1, end + 1));
    end = start;
    if (end === 0) break;
  }
  return [seq.slice(0, end + 1), ...parts];
}

function corners(row: number, col: number, lastRow: number, lastCol: number, r: number): AlbumCell["radius"] {
  return [row === 0 && col === 0 ? r : 0, row === 0 && col === lastCol ? r : 0, row === lastRow && col === lastCol ? r : 0, row === lastRow && col === 0 ? r : 0];
}

/** Ảnh (cỡ gốc) đặt vừa trong ô w x h giữ tỉ lệ thì hụt bao nhiêu mỗi chiều */
function containLoss(w: number, h: number, p: AlbumPhotoSize): { lossW: number; lossH: number } {
  const image = ratioOf(p);
  if (image > w / h) return { lossW: 0, lossH: h - w / image };
  return { lossW: w - h * image, lossH: 0 };
}

function squareLayout(count: number): AlbumLayout {
  const cols = Math.min(Math.floor((ALBUM_WIDTH - SPACING) / (SPACING + SQUARE_CELL)), count);
  const rows = Math.ceil(count / cols);
  const cells: AlbumCell[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    cells.push({ x: col * (SQUARE_CELL + SPACING), y: row * (SQUARE_CELL + SPACING), width: SQUARE_CELL, height: SQUARE_CELL, fit: "cover", radius: [6, 6, 6, 6] });
  }
  return { width: cols * (SQUARE_CELL + SPACING) - SPACING, height: rows * (SQUARE_CELL + SPACING) - SPACING, cells };
}

/** Bố cục khung album ở bề rộng ALBUM_WIDTH; ô theo đúng thứ tự `photos` */
export function zaloAlbumLayout(photos: AlbumPhotoSize[]): AlbumLayout {
  if (photos.length === 0) return { width: 0, height: 0, cells: [] };
  if (photos.length >= SQUARE_LAYOUT_FROM) return squareLayout(photos.length);
  const contain = new Set<number>();
  const ratios = photos.map((p, i) => {
    const r = ratioOf(p);
    if (r >= LOWER_RATIO && r <= UPPER_RATIO) return r;
    contain.add(i);
    return r > UPPER_RATIO ? UPPER_CROP_RATIO : LOWER_CROP_RATIO;
  });
  const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
  let rowCount = Math.round((sum(ratios) * TARGET_HEIGHT) / ALBUM_WIDTH);
  if (ratios.length > 4) rowCount = Math.max(Math.ceil(ratios.length / 4), rowCount);
  if (rowCount < 1) return singleRow(ratios, contain);

  const rows = linearPartition(ratios, rowCount);
  const cells: AlbumCell[] = [];
  let carry: number[] = [];
  let y = 0;
  let b = 0;
  for (let s = 0; s < rows.length; s++) {
    const row = [...carry, ...rows[s]!];
    const isLast = s === rows.length - 1;
    // Zalo PC chỉ cộng tỉ lệ của hàng hiện tại (bỏ sót ảnh gộp từ hàng trước); ở đây cộng cả hàng
    let h = Math.round((ALBUM_WIDTH - SPACING * (row.length - 1)) / sum(row));
    if (h > TALL_ROW) {
      const tooMany = !isLast && row.length + rows[s + 1]!.length > MAX_MERGED_ROW;
      if (!isLast && !tooMany) {
        carry = row;
        continue;
      }
      h = CLAMPED_ROW_HEIGHT;
      contain.add(b);
    }
    h = Math.max(h, MIN_ROW_HEIGHT);
    // Ảnh hẹp hơn MIN_ITEM_WIDTH thì nới ra, lấy phần nới từ các ảnh sau trong hàng
    let owed = row.map((r) => Math.round(h * r)).reduce((acc, w) => acc + (w < MIN_ITEM_WIDTH ? MIN_ITEM_WIDTH - w : 0), 0);
    const nudged = owed > 0;
    let x = 0;
    for (let g = 0; g < row.length; g++) {
      let w = Math.round(h * row[g]!);
      if (nudged) {
        contain.add(b);
        if (w < MIN_ITEM_WIDTH) w = MIN_ITEM_WIDTH;
        else if (w - owed < MIN_ITEM_WIDTH) {
          owed -= w - MIN_ITEM_WIDTH;
          w = MIN_ITEM_WIDTH;
        } else {
          w -= owed;
          owed = 0;
        }
      }
      // Ảnh cuối hàng lấp tới mép phải
      const width = g === row.length - 1 ? ALBUM_WIDTH - x : w;
      if (row.length === 1 && h > w / ratioOf(photos[b]!)) h = Math.max(w / ratioOf(photos[b]!), MIN_ROW_HEIGHT);
      if (h > TALL_ROW) h = CLAMPED_ROW_HEIGHT;
      const loss = containLoss(width, h, photos[b]!);
      const smallLoss = (loss.lossH > 0 && loss.lossH <= FIT_LOSS && loss.lossW === 0) || (loss.lossW > 0 && loss.lossW <= FIT_LOSS && loss.lossH === 0);
      const loose = Math.abs(width - w) > FIT_LOSS || carry.length > 0;
      const fit = (contain.has(b) || loose) && !smallLoss ? "contain" : "cover";
      cells.push({ x, y, width, height: h, fit, radius: corners(s, g, rows.length - 1, row.length - 1, RADIUS) });
      x += w + SPACING;
      b++;
    }
    y += h + SPACING;
    carry = [];
  }
  return { width: ALBUM_WIDTH, height: y - SPACING, cells };
}

/** Ít ảnh, tổng tỉ lệ nhỏ (vd hai ảnh dọc): một hàng duy nhất */
function singleRow(ratios: number[], contain: Set<number>): AlbumLayout {
  let h = Math.round((ALBUM_WIDTH - SPACING * (ratios.length - 1)) / ratios.reduce((a, b) => a + b, 0));
  if (h > TALL_ROW) h = Math.max(MIN_ROW_HEIGHT, Math.min(CLAMPED_ROW_HEIGHT, h));
  const cells: AlbumCell[] = [];
  let x = 0;
  ratios.forEach((r, i) => {
    const w = Math.round(h * r);
    cells.push({ x, y: 0, width: w, height: h, fit: contain.has(i) ? "contain" : "cover", radius: corners(0, i, 0, ratios.length - 1, RADIUS) });
    x += w + SPACING;
  });
  return { width: x - SPACING, height: h, cells };
}

/**
 * Hệ số thu nhỏ khung theo bề rộng còn trống (`available`), như Zalo PC: không phóng to quá cỡ bố cục, khung
 * `ALBUM_WIDTH` không nhỏ hơn `ALBUM_MIN_WIDTH` (chỗ quá hẹp thì khung tràn ra chứ không bé tí)
 */
export function albumScale(available: number, layoutWidth = ALBUM_WIDTH): number {
  if (layoutWidth <= 0) return 1;
  return Math.max(Math.min(1, available / layoutWidth), ALBUM_MIN_WIDTH / ALBUM_WIDTH);
}
