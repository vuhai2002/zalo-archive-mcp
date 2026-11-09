import fs from "node:fs/promises";
import type { AttachmentSource, SendMessageResponse } from "zca-js";
import { imageSize } from "../media/image-dimensions.js";
import type { OutboxFile } from "../storage/outbox-item-mapping.js";

/**
 * File của một mục hàng đợi -> dạng zca-js gửi được. Luôn đưa DỮ LIỆU + tên file thay vì đường dẫn: zca-js lấy tên file
 * từ đường dẫn bằng cách tách theo "/" nên đường dẫn Windows ra tên sai, và ảnh theo đường dẫn còn đòi bộ đọc cỡ ảnh riêng.
 * Tên hiển thị là tên gốc (file trong kho cất theo mã băm). Đọc lúc gửi: file bị xóa / đổi từ lúc xếp hàng thì báo lỗi rõ.
 */
export async function toAttachmentSources(files: OutboxFile[]): Promise<AttachmentSource[]> {
  const out: AttachmentSource[] = [];
  for (const f of files) {
    let data: Buffer;
    try {
      data = await fs.readFile(f.path);
    } catch {
      throw new Error(`Không đọc được file "${f.name}" (${f.path}) - đã bị xóa hoặc di chuyển?`);
    }
    const size = f.kind === "image" ? imageSize(data) : null;
    out.push({
      data,
      filename: f.name as `${string}.${string}`,
      metadata: { totalSize: data.length, ...(size ?? {}) },
    });
  }
  return out;
}

/** Mã tin để đánh dấu đã gửi (và thu hồi được sau): tin chữ nếu có, không thì file đầu tiên */
export function sentMsgIdOf(res: SendMessageResponse): string | null {
  const id = res.message?.msgId ?? res.attachment?.[0]?.msgId;
  return id === undefined || id === null ? null : String(id);
}
