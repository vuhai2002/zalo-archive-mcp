/**
 * Rộng / cao của ảnh đọc từ phần đầu file (PNG, JPEG, WebP, GIF) - không cần thư viện ảnh. zca-js cần cỡ ảnh khi gửi ảnh từ
 * bộ nhớ (tên file Windows qua đường dẫn bị zca-js tách sai nên kho luôn đưa dữ liệu thay vì đường dẫn). Không đọc được thì null:
 * ảnh vẫn gửi, Zalo tự đo.
 */
export type ImageSize = { width: number; height: number };

const ok = (width: number, height: number): ImageSize | null => (width > 0 && height > 0 ? { width, height } : null);

function png(b: Buffer): ImageSize | null {
  // Chữ ký 8 byte, rồi khối IHDR: rộng, cao (big-endian) ở byte 16 và 20
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString("ascii", 12, 16) !== "IHDR") return null;
  return ok(b.readUInt32BE(16), b.readUInt32BE(20));
}

function gif(b: Buffer): ImageSize | null {
  if (b.length < 10 || b.toString("ascii", 0, 3) !== "GIF") return null;
  return ok(b.readUInt16LE(6), b.readUInt16LE(8));
}

function jpeg(b: Buffer): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    // Khung SOF0..SOF15 (trừ DHT C4, JPG C8, DAC CC) mang cỡ ảnh: cao rồi rộng
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return ok(b.readUInt16BE(i + 7), b.readUInt16BE(i + 5));
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function webp(b: Buffer): ImageSize | null {
  if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return ok(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return ok(1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff));
  }
  if (chunk === "VP8 ") return ok(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
  return null;
}

export function imageSize(b: Buffer): ImageSize | null {
  try {
    return png(b) ?? jpeg(b) ?? webp(b) ?? gif(b);
  } catch {
    return null;
  }
}
