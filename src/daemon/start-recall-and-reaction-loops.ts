import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { ThreadType, type API, type Reactions } from "zca-js";
import { OutboxRecaller } from "../outbox/outbox-recall-loop.js";
import { ReactionSender } from "../outbox/reaction-sender-loop.js";

const toZaloType = (t: "user" | "group") => (t === "group" ? ThreadType.Group : ThreadType.User);

/**
 * Hai vòng nhỏ trong daemon làm việc người dùng yêu cầu trên một tin đã có: thu hồi tin kho đã gửi (MCP / dashboard ghi yêu
 * cầu) và thả cảm xúc (dashboard ghi yêu cầu). Trả hàm dừng cả hai.
 */
export function startRecallAndReactionLoops(d: {
  api: API;
  db: DatabaseSync;
  log: Logger;
  isReadOnly: () => boolean;
  isListenerConnected: () => boolean;
}): () => void {
  const recaller = new OutboxRecaller({
    db: d.db,
    log: d.log.child({ part: "recall" }),
    isReadOnly: d.isReadOnly,
    recall: async (m) => {
      await d.api.undo({ msgId: m.msgId, cliMsgId: m.cliMsgId }, m.threadId, toZaloType(m.threadType));
    },
  });
  const reactions = new ReactionSender({
    db: d.db,
    log: d.log.child({ part: "reaction" }),
    isReadOnly: d.isReadOnly,
    isListenerConnected: d.isListenerConnected,
    react: async (r) => {
      // Chỉ mã trong QUICK_REACTIONS (route đã kiểm) - đều là giá trị của enum Reactions trong zca-js
      await d.api.addReaction(r.icon as Reactions, { data: { msgId: r.msgId, cliMsgId: r.cliMsgId }, threadId: r.threadId, type: toZaloType(r.threadType) });
    },
  });
  recaller.start();
  reactions.start();
  return () => {
    recaller.stop();
    reactions.stop();
  };
}
