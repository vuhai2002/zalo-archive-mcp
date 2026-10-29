import type { DatabaseSync } from "node:sqlite";
import type { MessageRow } from "../storage/message-read-queries.js";
import type { OutboxItem as StoredOutboxItem } from "../storage/outbox-store.js";
import { threadLabel } from "../storage/thread-directory-store.js";
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
    reactions: m.reactions,
    attachments: m.attachments.map(
      (a): AttachmentInfo => ({
        id: a.id,
        kind: a.kind as AttachmentInfo["kind"],
        status: a.status as AttachmentInfo["status"],
        fileName: a.fileName,
        sizeBytes: a.sizeBytes,
        url: a.status === "done" ? `/api/media/${a.id}` : null,
        mime: a.mime,
      }),
    ),
  };
}

export function toOutboxItemDto(db: DatabaseSync, item: StoredOutboxItem): OutboxItem {
  return {
    id: item.id,
    threadId: item.threadId,
    threadType: item.threadType,
    threadName: threadLabel(db, item.threadId)?.name ?? null,
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
  };
}
