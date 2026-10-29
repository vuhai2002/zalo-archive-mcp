/** Kiểu dữ liệu chung của kho, độc lập với zca-js */

export type ThreadKind = "user" | "group";

/** Tin vào kho bằng đường nào - để kho trung thực về độ phủ */
export type MessageSource = "live" | "old_messages" | "mobile_sync" | "journal_replay";

export type AttachmentKind = "photo" | "video" | "file" | "voice" | "gif";

export type AttachmentDescriptor = {
  kind: AttachmentKind;
  remoteUrl: string;
  fileName: string | null;
  declaredSize: number | null;
};

export type NormalizedMessage = {
  /** id toàn cục của Zalo, khóa khử trùng */
  msgId: string;
  cliMsgId: string | null;
  threadId: string;
  threadType: ThreadKind;
  senderId: string;
  senderName: string | null;
  isSelf: boolean;
  msgType: string;
  /** Chữ của tin, caption ảnh, hoặc mô tả ngắn cho tin không có chữ */
  text: string;
  quoteMsgId: string | null;
  /** ISO UTC, giờ người ta bấm gửi (từ `data.ts`) */
  sentAt: string;
  attachments: AttachmentDescriptor[];
  /** `data` gốc của zca-js dạng JSON */
  rawJson: string;
};

export type NormalizedRecall = {
  /** msg_id của tin BỊ thu hồi */
  msgId: string;
  threadId: string;
  recalledBy: string;
  recalledAt: string;
  rawJson: string;
};
