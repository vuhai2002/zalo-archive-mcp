import { parseContentParams } from "../zalo/extract-message-attachments.js";

/**
 * Phần thuần của việc xin Zalo cấp lại link media (lời gọi `renewlink`, cmd 12094): dựng thông
 * tin media gửi lên từ tin gốc, đọc link mới trong phản hồi. Tham số theo cách Zalo Web gọi
 * (bước "chuyển tiếp" của nó cấp bản sao link cho media cũ) - chỉ tên tham số, không chép code.
 */

export type MediaUrlBag = { normalUrl?: string; hdUrl?: string; thumbUrl?: string };

/** Loại media trong lời gọi renewlink: Zalo Web chỉ xin lại cho file, ảnh, video */
const RENEW_MEDIA_TYPE: Record<string, number> = { file: 1, photo: 2, video: 5 };

export function renewableMediaType(kind: string): number | null {
  return RENEW_MEDIA_TYPE[kind] ?? null;
}

/** Các loại file Zalo cấp lại link (còn lại - tin thoại, gif... - Zalo không cấp) */
export const RENEWABLE_KINDS: readonly string[] = Object.keys(RENEW_MEDIA_TYPE);

const httpUrl = (v: unknown): string | undefined =>
  typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : undefined;

function compact(o: Record<string, string | number | undefined>): Record<string, string | number> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string | number>;
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);
const MD5 = /^[a-f0-9]{32}$/i;

/**
 * Thông tin file như Zalo Web gửi khi chuyển tiếp file (cũng là thứ nó gửi lên renewlink): link, tên,
 * đuôi, checksum MD5, cỡ, loại (`fType`, mặc định 1), kèm `fdata` / ảnh nhỏ nếu có. Chỉ gửi link + tiêu
 * đề thì Zalo trả "Tham số không hợp lệ". Checksum không đúng dạng MD5 thì bỏ (Zalo Web cũng từ chối).
 */
function fileMsgInfo(content: Record<string, unknown>, href: string, thumb: string | undefined): Record<string, string | number> {
  const params = parseContentParams(content);
  const fileName = text(content.title);
  const extFromName = fileName && fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : undefined;
  const checksum = text(params.checksum);
  const fType = Number(params.fType);
  return compact({
    url: href,
    fileName,
    extension: text(params.fileExt) ?? extFromName,
    checksum: checksum && MD5.test(checksum) ? checksum : undefined,
    size: text(params.fileSize),
    fType: Number.isInteger(fType) && fType > 0 ? fType : 1,
    fdata: text(params.fdata),
    thumbUrl: thumb,
  });
}

/**
 * `msgInfo` gửi lên, dựng từ `content` của tin gốc như Zalo Web: ảnh có link thường (href),
 * HD (params.hd), ảnh nhỏ (thumb), bản gốc = HD hoặc thường; file có link, tên, đuôi, checksum,
 * cỡ (`fileMsgInfo`); video có `videoUrl`. Thiếu link thì dùng link kho đang tải.
 */
export function renewMsgInfoFromRawJson(kind: string, rawJson: string, fallbackUrl: string): Record<string, string | number> {
  let content: Record<string, unknown> = {};
  try {
    const data = JSON.parse(rawJson) as { content?: unknown };
    if (data.content && typeof data.content === "object" && !Array.isArray(data.content)) {
      content = data.content as Record<string, unknown>;
    }
  } catch {
    // raw_json hỏng: chỉ còn link đang tải
  }
  const href = httpUrl(content.href) ?? httpUrl(content.normalUrl) ?? httpUrl(content.url) ?? fallbackUrl;
  const thumb = httpUrl(content.thumb) ?? httpUrl(content.thumbUrl);
  if (kind === "photo") {
    const hd = httpUrl(parseContentParams(content).hd) ?? httpUrl(content.hdUrl);
    const ori = hd ?? href;
    return compact({ normalUrl: href, hdUrl: hd, thumbUrl: thumb, oriUrl: ori, url: ori });
  }
  if (kind === "video") return compact({ videoUrl: href, thumbUrl: thumb, renewType: 1 });
  return fileMsgInfo(content, href, thumb);
}

export type RenewReply = { kind: "urls"; bag: MediaUrlBag } | { kind: "async" };

/**
 * Đọc phản hồi (đã giải mã). Ảnh: `normal` / `hd` / `thumb`; file, video: `fileUrl`. Phản hồi
 * `async` = Zalo trả link sau qua sự kiện trên kênh WebSocket. Chấp nhận thêm vài tên khác và
 * chuỗi JSON lồng ở `data`, vì dạng phản hồi chưa có tài liệu. Không có gì dùng được thì null.
 */
export function readRenewReply(response: unknown): RenewReply | null {
  const candidates: unknown[] = [response];
  for (let i = 0; i < candidates.length && i < 6; i++) {
    let v = candidates[i];
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        continue;
      }
    }
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const bag = compact({
      normalUrl: httpUrl(o.normal) ?? httpUrl(o.fileUrl) ?? httpUrl(o.normalUrl) ?? httpUrl(o.url),
      hdUrl: httpUrl(o.hd) ?? httpUrl(o.hdUrl),
      thumbUrl: httpUrl(o.thumb) ?? httpUrl(o.thumbUrl),
    }) as MediaUrlBag;
    if (bag.normalUrl || bag.hdUrl || bag.thumbUrl) return { kind: "urls", bag };
    if (o.async === true || o.async === 1) return { kind: "async" };
    candidates.push(o.data, o.msgInfo);
  }
  return null;
}

/** Chọn link để tải lại: ảnh lấy bản to nhất như lúc lưu trữ, loại khác lấy link thường */
export function pickRenewedUrl(kind: string, bag: MediaUrlBag): string | null {
  const order = kind === "photo" ? [bag.hdUrl, bag.normalUrl, bag.thumbUrl] : [bag.normalUrl, bag.hdUrl];
  return order.find((u): u is string => Boolean(u)) ?? null;
}
