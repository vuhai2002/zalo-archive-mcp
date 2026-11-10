import fs from "node:fs/promises";
import type { AttachmentSource, MessageContent, SendMessageResponse } from "zca-js";
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

/**
 * Thứ tự gửi một mục có file, như gửi tay trên Zalo: (1) mọi ẢNH trong một lần - zca-js gắn chung mã chùm nên Zalo hiện thành
 * một chùm ảnh, (2) các file còn lại (video, PDF...) trong một lần sau đó. Tin chữ (nếu có) gửi riêng SAU CÙNG - luật người
 * dùng chốt 2026-11-10: chữ luôn đi sau ảnh / file. Tách ảnh khỏi file vì gửi chung thì zca-js đếm cả file vào số món của
 * chùm ảnh (chùm "4 món" mà chỉ có 3 ảnh). Bỏ nhóm rỗng.
 */
export function splitFilesForSending(files: OutboxFile[]): OutboxFile[][] {
  const images = files.filter((f) => f.kind === "image");
  const others = files.filter((f) => f.kind !== "image");
  return [images, others].filter((g) => g.length > 0);
}

/**
 * Gửi một mục có file theo thứ tự trên (`send` = một lần gọi zca-js sendMessage cho hội thoại của mục): từng nhóm file với chữ
 * rỗng, rồi tin chữ (đã kèm nhắc tên / trả lời qua `textContent`) nếu có. Trả mã tin chữ, không có chữ thì mã file đầu tiên.
 */
export async function sendFilesThenText(
  item: { files: OutboxFile[]; text: string },
  send: (content: MessageContent) => Promise<SendMessageResponse>,
  textContent: (text: string) => string | MessageContent,
): Promise<{ msgId: string | null }> {
  let firstFileMsgId: string | null = null;
  for (const group of splitFilesForSending(item.files)) {
    // Gửi trước, ghi mã sau: viết gộp "??=" thì nhóm sau không được gửi (vế phải bị bỏ qua khi đã có mã)
    const res = await send({ msg: "", attachments: await toAttachmentSources(group) });
    firstFileMsgId ??= sentMsgIdOf(res);
  }
  if (!item.text.trim()) return { msgId: firstFileMsgId };
  const content = textContent(item.text);
  const res = await send(typeof content === "string" ? { msg: content } : content);
  return { msgId: sentMsgIdOf(res) ?? firstFileMsgId };
}

/** Mã tin để đánh dấu đã gửi (và thu hồi được sau): tin chữ nếu có, không thì file đầu tiên */
export function sentMsgIdOf(res: SendMessageResponse): string | null {
  const id = res.message?.msgId ?? res.attachment?.[0]?.msgId;
  return id === undefined || id === null ? null : String(id);
}
