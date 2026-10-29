import { ThreadType, type Message, type Undo } from "zca-js";
import type { RawListenerMessage } from "./normalize-zalo-event.js";

/** Đổi object của zca-js sang dạng phẳng ghi được vào nhật ký */
export function messageToRaw(m: Message): RawListenerMessage {
  return {
    threadType: m.type === ThreadType.Group ? "group" : "user",
    threadId: String(m.threadId),
    isSelf: m.isSelf,
    data: m.data as unknown as Record<string, unknown>,
  };
}

export function undoToRaw(u: Undo): RawListenerMessage {
  return {
    threadType: u.isGroup ? "group" : "user",
    threadId: String(u.threadId),
    isSelf: u.isSelf,
    data: u.data as unknown as Record<string, unknown>,
  };
}
