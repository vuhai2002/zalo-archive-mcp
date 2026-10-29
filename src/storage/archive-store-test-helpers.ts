import type { NormalizedMessage } from "../archive/archived-message-types.js";

/** Tin mẫu cho test; ghi đè trường cần thiết qua `overrides` */
export function sampleMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    msgId: "1000",
    cliMsgId: "c1000",
    threadId: "u-lan",
    threadType: "user",
    senderId: "u-lan",
    senderName: "Lan",
    isSelf: false,
    msgType: "webchat",
    text: "Chào anh",
    quoteMsgId: null,
    sentAt: "2026-10-28T03:00:00.000Z",
    attachments: [],
    rawJson: "{}",
    ...overrides,
  };
}
