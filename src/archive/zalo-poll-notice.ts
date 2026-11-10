import { compose, parseObject, type NoticeNames, type Piece, type SystemNotice } from "./zalo-system-notice.js";

/**
 * Tin bình chọn của nhóm (msg_type `group.poll`): Zalo gửi một tin mỗi lần có người tạo / tham gia / đổi lựa chọn / khóa /
 * chia sẻ một cuộc bình chọn. Trong `content.params` (chuỗi JSON) có sẵn mẫu câu tiếng Việt ("%1$s tham gia cuộc bình chọn:
 * %2$s"), câu hỏi và mã bình chọn; phương án + số phiếu KHÔNG có (daemon hỏi riêng bằng getPollDetail). Module thuần.
 */
export const POLL_MSG_TYPE = "group.poll";

export type PollEvent = {
  /** Giữ dạng chữ số: lấy thẳng từ chuỗi params để không bị JSON.parse làm tròn */
  pollId: string;
  action: string;
  question: string;
  /** Người làm hành động = người gửi tin (uidFrom dạng chuỗi ở ngoài params; uid trong params là số đã bị làm tròn) */
  actorId: string | null;
  actorName: string | null;
  template: string;
};

/** Mẫu câu dự phòng khi Zalo không gửi kèm (lấy theo câu Zalo dùng cho từng hành động) */
const FALLBACK_TEMPLATE: Record<string, string> = {
  create: "%1$s tạo cuộc bình chọn mới: %2$s",
  vote: "%1$s tham gia cuộc bình chọn: %2$s",
  update: "%1$s đổi lựa chọn trong cuộc bình chọn: %2$s",
  close: "%1$s khóa bình chọn: %2$s",
  share: "%1$s chia sẻ cuộc bình chọn: %2$s",
};

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Từ dữ liệu một tin bình chọn (payload của listener hoặc raw_json đã lưu - cùng hình dạng) */
export function pollEventOf(data: unknown): PollEvent | null {
  const d = parseObject(data);
  const content = parseObject(d?.content);
  const paramsRaw = str(content?.params);
  const params = parseObject(paramsRaw);
  const pollId = /"pollId"\s*:\s*"?(\d+)/.exec(paramsRaw)?.[1];
  if (!d || !content || !params || !pollId) return null;
  const action = str(content.action) || "update";
  const msg = parseObject(params.msg);
  const template = str(msg?.vi).trim() || FALLBACK_TEMPLATE[action] || "%1$s cập nhật cuộc bình chọn: %2$s";
  return {
    pollId,
    action,
    question: str(params.question).trim(),
    actorId: str(d.uidFrom) || null,
    actorName: str(d.dName).trim() || str(params.dName).trim() || null,
    template,
  };
}

/** Từ raw_json đã lưu của tin `group.poll` */
export const pollEventFromRawJson = (rawJson: string | null): PollEvent | null => (rawJson ? pollEventOf(rawJson) : null);

/**
 * Câu thông báo như Zalo PC: "**Mẫn Lư** tham gia cuộc bình chọn: **Đi dã ngoại cuối tuần ...**" - tên và câu hỏi in đậm,
 * chính mình thì "Bạn". Tên tra danh bạ (tên gợi nhớ) trước, rồi tới tên Zalo gửi kèm.
 */
export function pollNoticeOf(ev: PollEvent, names: NoticeNames): SystemNotice {
  const self = !!ev.actorId && ev.actorId === names.selfUid;
  const name = self ? "Bạn" : (ev.actorId ? names.nameOf(ev.actorId) : null) ?? ev.actorName ?? "Một thành viên";
  const values: Record<string, string> = { "1": name, "2": ev.question || "(không có câu hỏi)" };
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of ev.template.matchAll(/%(\d+)\$s/g)) {
    pieces.push(ev.template.slice(last, m.index));
    pieces.push({ bold: values[m[1]!] ?? "" });
    last = m.index + m[0].length;
  }
  pieces.push(ev.template.slice(last));
  return { ...compose(pieces), avatar: null };
}
