import type { API } from "zca-js";

/**
 * Nghe thẳng khung WebSocket của listener zca-js cho những lệnh lib bỏ qua (kết quả xin lại link,
 * hàng chờ điều khiển lấy bù...). Khung Zalo: byte 0 phiên bản, byte 1-2 số lệnh (little-endian),
 * byte 3 lệnh con, sau đó là JSON. Chỉ soi đầu khung, đúng lệnh mới gọi `onFrame` - tin nhắn thường
 * không tốn công giải mã. Listener tạo WebSocket mới mỗi lần nối lại nên gắn lại sau mỗi "connected".
 */
type ListenerLike = {
  on: (event: string, fn: () => void) => void;
  off?: (event: string, fn: () => void) => void;
  ws?: { on: (e: string, fn: (d: unknown) => void) => void; off?: (e: string, fn: (d: unknown) => void) => void } | null;
  cipherKey?: string | null;
};

export function attachRawWsFrameListener(
  api: API,
  wanted: { cmd: number; subCmd: number },
  onFrame: (frame: Buffer, cipherKey: string | null) => void,
  onError: (err: unknown) => void,
): () => void {
  const listener = (api as unknown as { listener?: ListenerLike }).listener;
  if (!listener || typeof listener.on !== "function") return () => {};
  let boundWs: ListenerLike["ws"] = null;
  const handle = (data: unknown) => {
    if (!Buffer.isBuffer(data) || data.length < 5 || data[0] !== 1) return;
    if (data.readUInt16LE(1) !== wanted.cmd || data[3] !== wanted.subCmd) return;
    try {
      onFrame(data, listener.cipherKey ?? null);
    } catch (err) {
      onError(err);
    }
  };
  const bind = () => {
    const ws = listener.ws;
    if (!ws || ws === boundWs) return;
    boundWs?.off?.("message", handle);
    boundWs = ws;
    ws.on("message", handle);
  };
  listener.on("connected", bind);
  bind();
  return () => {
    listener.off?.("connected", bind);
    boundWs?.off?.("message", handle);
    boundWs = null;
  };
}
