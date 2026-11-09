import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { ThreadType, type API } from "zca-js";
import type { AppEnv } from "../config/env-schema.js";
import { OutboxSender } from "../outbox/outbox-sender-loop.js";
import { sentMsgIdOf, toAttachmentSources } from "../outbox/outbox-zalo-attachments.js";
import { forwardedMsgId, toZaloMessage } from "../outbox/outbox-zalo-message-content.js";

const toZaloType = (t: "user" | "group") => (t === "group" ? ThreadType.Group : ThreadType.User);

/**
 * Vòng gửi của daemon nối với zca-js: tin chữ (nhắc tên, trả lời), tin kèm file, tin chuyển tiếp, "đang soạn". Trả hàm dừng.
 */
export function startOutboxSender(d: {
  api: API;
  db: DatabaseSync;
  env: AppEnv;
  log: Logger;
  isListenerConnected: () => boolean;
  isReadOnly: () => boolean;
}): () => void {
  const { api } = d;
  const sender = new OutboxSender({
    db: d.db,
    env: d.env,
    log: d.log.child({ part: "sender" }),
    isListenerConnected: d.isListenerConnected,
    isReadOnly: d.isReadOnly,
    sendText: async (threadId, type, text, mentions, replyTo) => {
      // Có nhắc tên (@) thì gửi kèm danh sách nhắc - Zalo mới tô xanh và báo cho người được nhắc; trả lời tin thì kèm tin gốc
      const res = await api.sendMessage(toZaloMessage(text, mentions, replyTo), threadId, toZaloType(type));
      return { msgId: res.message?.msgId !== undefined ? String(res.message.msgId) : null };
    },
    // Gửi file: chữ (nếu có) zca-js gửi riêng trước file, trừ một ảnh kèm chú thích; nhắc tên + trả lời đi cùng phần chữ
    sendFiles: async (item) => {
      const base = toZaloMessage(item.text, item.mentions, item.replyTo);
      const content = typeof base === "string" ? { msg: base } : base;
      const res = await api.sendMessage({ ...content, attachments: await toAttachmentSources(item.files) }, item.threadId, toZaloType(item.threadType));
      return { msgId: sentMsgIdOf(res) };
    },
    forwardText: async (threadId, type, text) => forwardedMsgId(await api.forwardMessage({ message: text }, [threadId], toZaloType(type))),
    sendTyping: async (threadId, type) => {
      await api.sendTypingEvent(threadId, toZaloType(type));
    },
  });
  sender.start();
  return () => sender.stop();
}
