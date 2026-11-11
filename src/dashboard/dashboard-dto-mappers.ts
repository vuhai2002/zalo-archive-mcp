import type { DatabaseSync } from "node:sqlite";
import { effectiveMime } from "../shared/safe-mime-from-file-name.js";
import type { AttachmentRow, MessageRow } from "../storage/message-read-queries.js";
import { sentMessageRecord } from "../storage/outbox-recall-store.js";
import type { OutboxItem as StoredOutboxItem } from "../storage/outbox-store.js";
import { threadLabel } from "../storage/thread-directory-store.js";
import { groupMosaicIfNoAvatar } from "../storage/thread-list-extras.js";
import type { ArchivedMessage, AttachmentInfo, OutboxItem } from "./dashboard-api-contract.js";

/** Đổi dữ liệu kho sang hình dạng trong hợp đồng API (không lộ đường dẫn file trên máy) */

export function toArchivedMessage(m: MessageRow): ArchivedMessage {
  return {
    id: m.id,
    msgId: m.msgId,
    threadId: m.threadId,
    threadType: m.threadType,
    senderId: m.senderId,
    senderName: m.senderName,
    senderAvatarUrl: m.senderAvatarUrl,
    isSelf: m.isSelf,
    msgType: m.msgType,
    text: m.text,
    quoteMsgId: m.quoteMsgId,
    sentAt: m.sentAt,
    recalledAt: m.recalledAt,
    source: m.source,
    textStyles: m.textStyles,
    call: m.call,
    album: m.album,
    link: m.link,
    contactCard: m.contactCard,
    quote: m.quote,
    video: m.video,
    noticeAvatars: m.noticeAvatars,
    noticePeople: m.noticePeople,
    poll: m.poll,
    reactions: m.reactions,
    attachments: m.attachments.map(toAttachmentInfo),
  };
}

/**
 * Link xem file: số đính kèm + dấu nội dung (sha256). Số đính kèm chỉ duy nhất trong kho của MỘT nick,
 * và cùng số có thể đổi file (xin lại link rồi tải lại) - thiếu dấu thì trình duyệt (giữ đệm 1 ngày) lấy
 * nhầm ảnh của nick khác / bản cũ. Máy chủ bỏ qua `?v=`, chỉ trình duyệt dùng nó làm khóa đệm.
 */
export function mediaUrl(a: { id: number; sha256: string | null }): string {
  return a.sha256 ? `/api/media/${a.id}?v=${a.sha256.slice(0, 16)}` : `/api/media/${a.id}`;
}

export function toAttachmentInfo(a: AttachmentRow): AttachmentInfo {
  return {
    id: a.id,
    kind: a.kind as AttachmentInfo["kind"],
    status: a.status as AttachmentInfo["status"],
    fileName: a.fileName,
    sizeBytes: a.sizeBytes,
    url: a.status === "done" ? mediaUrl(a) : null,
    // Cùng kiểu file mà /api/media trả: khung chat biết file nào phát / mở trong tab được
    mime: effectiveMime(a.mime, a.fileName),
    renewState: a.renewPending ? "waiting" : a.zaloDeleted ? "deleted" : a.renewed && a.status === "failed" ? "gave_up" : null,
  };
}

export function toOutboxItemDto(db: DatabaseSync, item: StoredOutboxItem): OutboxItem {
  const label = threadLabel(db, item.threadId);
  return {
    id: item.id,
    threadId: item.threadId,
    threadType: item.threadType,
    threadName: label?.name ?? null,
    threadAvatarUrl: label?.avatarUrl ?? null,
    ...groupMosaicIfNoAvatar(db, item.threadType, item.threadId, label?.avatarUrl ?? null),
    text: item.text,
    mode: item.mode,
    batchId: item.batchId,
    notBefore: item.notBefore,
    status: item.status,
    createdBy: item.createdBy,
    note: item.note,
    createdAt: item.createdAt,
    finishedAt: item.finishedAt,
    sentMsgId: item.sentMsgId,
    error: item.error,
    // Thu hồi qua kho, hoặc người dùng tự thu hồi trên Zalo (listener đánh dấu tin)
    recalledAt: item.recalledAt ?? (item.sentMsgId ? (sentMessageRecord(db, item.sentMsgId)?.recalledAt ?? null) : null),
    recallRequestedAt: item.recallRequestedAt,
    recallError: item.recallError,
    forwarded: item.forwardOf !== null,
    files: item.files.map((f) => ({ name: f.name, size: f.size, kind: f.kind })),
  };
}
