import { receivedFileKey, zaloPcMessageKey, type ZaloPcMediaIndex } from "./zalo-pc-media-index.js";

/** Đính kèm cần tìm bản Zalo PC (lấy từ tin trong kho) */
export type ZaloPcMediaOwner = {
  kind: string;
  /** Mã tin Zalo (msgId) - tên video / tin thoại kiểu cũ */
  msgId: string;
  threadId: string;
  threadType: "user" | "group";
  senderId: string;
  isSelf: boolean;
  cliMsgId: string | null;
  /** Checksum MD5 Zalo ghi cho file đính kèm (content.params.checksum) */
  checksum: string | null;
  /** Tên + cỡ file đính kèm - dò bản trong `Zalo Received Files` */
  fileName?: string | null;
  size?: number | null;
};

/**
 * Một bản có thể dùng cho file đính kèm. `noise` = bản bị làm nhiễu (phải bỏ nhiễu khi chép). `sure` = gắn chắc với
 * đúng tin (đặt tên theo mã tin) nên tin không có checksum vẫn nhận; bản khác chỉ nhận khi đúng MD5.
 */
export type ZaloPcFileSource = { file: string; noise: boolean; sure: boolean };

/** Bản Zalo PC của một đính kèm: ảnh có bản gốc và / hoặc bản xem trước; video, tin thoại là một file; file thử lần lượt */
export type ZaloPcMediaMatch =
  | { kind: "photo"; original: string | null; preview: string | null }
  | { kind: "video"; file: string }
  | { kind: "voice"; file: string }
  | { kind: "file"; sources: ZaloPcFileSource[]; md5: string | null };

const MD5 = /^[a-f0-9]{32}$/;

export function findZaloPcMedia(index: ZaloPcMediaIndex, owner: ZaloPcMediaOwner, selfUid: string): ZaloPcMediaMatch | null {
  const conversation = owner.threadType === "group" ? `g${owner.threadId}` : owner.threadId;
  const media = owner.cliMsgId
    ? index.byMessage.get(zaloPcMessageKey(owner.cliMsgId, owner.isSelf ? selfUid : owner.senderId, conversation))
    : undefined;
  if (owner.kind === "file") {
    const sum = owner.checksum?.toLowerCase() ?? "";
    const md5 = MD5.test(sum) ? sum : null;
    const received = owner.fileName && owner.size ? index.receivedFiles.get(receivedFileKey(owner.fileName, owner.size)) : undefined;
    // Bản thường trước, bản bị làm nhiễu sau cùng; video gửi dạng file Zalo PC cất ở thư mục video của hội thoại,
    // hoặc (kiểu cũ) ở `video/<mã tin>`
    const oldVideo = index.videosByMsgId.get(owner.msgId);
    const sources: Array<ZaloPcFileSource | null> = [
      md5 && index.plainFiles.has(md5) ? { file: index.plainFiles.get(md5)!, noise: false, sure: false } : null,
      media?.file ? { file: media.file, noise: false, sure: true } : null,
      media?.video ? { file: media.video, noise: false, sure: true } : null,
      oldVideo ? { file: oldVideo, noise: false, sure: true } : null,
      md5 && received ? { file: received, noise: false, sure: false } : null,
      md5 && index.noiseFiles.has(md5) ? { file: index.noiseFiles.get(md5)!, noise: true, sure: false } : null,
      media?.fileNoise ? { file: media.fileNoise, noise: true, sure: true } : null,
    ];
    const found = sources.filter((s): s is ZaloPcFileSource => s !== null);
    return found.length > 0 ? { kind: "file", sources: found, md5 } : null;
  }
  if (owner.kind === "photo" || owner.kind === "gif") {
    return media?.picture || media?.preview ? { kind: "photo", original: media.picture ?? null, preview: media.preview ?? null } : null;
  }
  if (owner.kind === "video") {
    const file = media?.video ?? index.videosByMsgId.get(owner.msgId);
    return file ? { kind: "video", file } : null;
  }
  if (owner.kind === "voice") {
    const file = media?.voice ?? index.voicesByMsgId.get(owner.msgId);
    return file ? { kind: "voice", file } : null;
  }
  return null;
}
