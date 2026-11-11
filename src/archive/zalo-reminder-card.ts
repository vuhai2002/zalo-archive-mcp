import { parseObject } from "./zalo-system-notice.js";

/**
 * Tin nhắc hẹn của nhóm: Zalo gửi thẻ `chat.ecard` (người gửi "Zalo") lúc tới giờ hẹn, nội dung `{title: "⏰ <tên hẹn>",
 * description: "Thứ Hai, 16 tháng 11 lúc 08:30", params: {actions: [{data: {act: "remind_topic", data: {...}}}]}}`; trong
 * `data` có giờ hẹn (`startTime`, ms), biểu tượng, có lặp không (`repeat`, `repeatRule` dạng "RRULE:FREQ=DAILY"). Đủ để vẽ thẻ
 * lịch như Zalo PC. Số người tham gia / từ chối KHÔNG có trong tin. Module thuần.
 */
export type ReminderRepeat = "daily" | "weekly" | "monthly" | "yearly";
export type ReminderCard = {
  /** Tên hẹn như Zalo hiện (đã bỏ biểu tượng đầu), Zalo tự rút gọn kiểu "...tuầ..." */
  title: string;
  emoji: string | null;
  /** Giờ hẹn (ISO UTC) */
  startAt: string;
  /** Kiểu lặp; null = không lặp */
  repeat: ReminderRepeat | null;
};

const FREQ: Record<string, ReminderRepeat> = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" };

function repeatOf(d: Record<string, unknown>): ReminderRepeat | null {
  if (Number(d.repeat) === 0) return null;
  const rules = Array.isArray(d.repeatRule) ? d.repeatRule.map(String) : [];
  const freq = rules.map((r) => /FREQ=([A-Z]+)/.exec(r)?.[1]).find((f) => f && FREQ[f]);
  return freq ? FREQ[freq]! : null;
}

/** Thẻ nhắc hẹn từ nội dung tin `chat.ecard` (object hoặc chuỗi JSON); tin ecard khác (kết bạn, sinh nhật...) thì null */
export function reminderCardOf(content: unknown): ReminderCard | null {
  const c = parseObject(content);
  const params = parseObject(c?.params);
  const actions = Array.isArray(params?.actions) ? (params.actions as unknown[]) : [];
  for (const a of actions) {
    const outer = parseObject(parseObject(a)?.data);
    if (outer?.act !== "remind_topic") continue;
    const d = parseObject(outer.data);
    const start = Number(d?.startTime);
    if (!d || !Number.isFinite(start) || start <= 0) return null;
    const emoji = typeof d.emoji === "string" && d.emoji.trim() ? d.emoji.trim() : null;
    const rawTitle = typeof c?.title === "string" ? c.title.trim() : "";
    const title = (emoji && rawTitle.startsWith(emoji) ? rawTitle.slice(emoji.length) : rawTitle).trim();
    return { title: title || "Nhắc hẹn", emoji, startAt: new Date(start).toISOString(), repeat: repeatOf(d) };
  }
  return null;
}
