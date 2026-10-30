import type { NormalizedMessage } from "../archive/archived-message-types.js";
import type { ReactionInput } from "../storage/message-reaction-store.js";

/**
 * Chuẩn hóa hai loại sự kiện của zca-js mà trước đây kho chỉ ghi nhật ký thô:
 * - reaction (`Reaction`: data.content.rMsg[].gMsgID, rIcon, uidFrom, ts);
 * - sự kiện nhóm (`GroupEvent`: act, data.sourceId = người làm, updateMembers = người bị tác động).
 * Đọc phòng thủ: payload do Zalo gửi, thiếu trường nào thì bỏ sự kiện đó, không ném.
 */
const DIGITS = /^\d+$/;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const msToIso = (v: unknown, fallback: Date) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 1_000_000_000_000 ? new Date(n).toISOString() : fallback.toISOString();
};

export function normalizeReaction(raw: unknown, receivedAt: Date): ReactionInput | null {
  const r = raw as { data?: Record<string, unknown>; threadId?: unknown; isGroup?: unknown } | null;
  const d = r?.data;
  // Cảm xúc trực tiếp: content là object; cảm xúc lấy bù (old_reactions, cmd 610/611): content là chuỗi JSON
  let rawContent: unknown = d?.content;
  if (typeof rawContent === "string") {
    try {
      rawContent = JSON.parse(rawContent);
    } catch {
      return null;
    }
  }
  const content = rawContent as { rMsg?: unknown; rIcon?: unknown } | undefined;
  const targets = (Array.isArray(content?.rMsg) ? (content.rMsg as Array<{ gMsgID?: unknown }>) : [])
    .map((x) => str(x?.gMsgID))
    .filter((id) => DIGITS.test(id));
  const reactorId = str(d?.uidFrom);
  const threadId = str(r?.threadId);
  if (targets.length === 0 || !DIGITS.test(reactorId) || !DIGITS.test(threadId) || typeof content?.rIcon !== "string") return null;
  // Mỗi lần bấm có msgId riêng; thiếu thì dựng từ người bấm + giờ (vẫn ổn định khi phát lại nhật ký)
  const actionId = DIGITS.test(str(d?.msgId)) ? str(d?.msgId) : `${reactorId}:${str(d?.ts)}`;
  return {
    actionId,
    targetMsgIds: [...new Set(targets)],
    reactorId,
    icon: content.rIcon,
    reactedAt: msToIso(d?.ts, receivedAt),
    threadId,
    threadType: r?.isGroup === true ? "group" : "user",
  };
}

type Member = { id: string; dName: string | null };

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} và ${names[names.length - 1]}`;
}

/**
 * Sự kiện nhóm -> một "tin hệ thống" (msg_type `group_event`) để hiện giữa dòng chat như
 * Zalo: "Ngạn Lư đã thêm Bạn và Mạc Văn Quế vào nhóm". Chỉ các sự kiện thành viên / tên / ảnh /
 * phó nhóm; còn lại (ghim, bảng tin, nhắc hẹn, cài đặt) thì null - vẫn nằm trong nhật ký thô.
 */
export function groupEventNotice(
  raw: unknown,
  ctx: { selfUid: string | null; nameOf: (uid: string) => string | null; groupNameOf: (groupId: string) => string | null; receivedAt: Date },
): NormalizedMessage | null {
  const e = raw as { act?: unknown; data?: Record<string, unknown> } | null;
  const d = e?.data;
  const act = str(e?.act);
  const groupId = str(d?.groupId);
  if (!act || !DIGITS.test(groupId)) return null;
  const actorId = str(d?.sourceId);
  const members: Member[] = (Array.isArray(d?.updateMembers) ? (d.updateMembers as Array<Record<string, unknown>>) : [])
    .map((m) => ({ id: str(m?.id), dName: str(m?.dName).trim() || null }))
    .filter((m) => DIGITS.test(m.id));

  const who = (id: string, dName: string | null = null) =>
    id && id === ctx.selfUid ? "Bạn" : (dName ?? members.find((m) => m.id === id)?.dName ?? ctx.nameOf(id) ?? (id || "Ai đó"));
  const actor = who(actorId);
  const list = joinNames(members.map((m) => who(m.id, m.dName)));
  const groupName = str(d?.groupName).trim();

  let text: string | null = null;
  if (act === "join") {
    text = members.length === 1 && members[0]!.id === actorId ? `${list} đã tham gia nhóm` : members.length ? `${actor} đã thêm ${list} vào nhóm` : null;
  } else if (act === "leave") text = `${list || actor} đã rời nhóm`;
  else if (act === "remove_member" && members.length) text = `${actor} đã mời ${list} ra khỏi nhóm`;
  else if (act === "block_member" && members.length) text = `${actor} đã chặn ${list} khỏi nhóm`;
  else if (act === "add_admin" && members.length) text = `${actor} đã thêm ${list} làm phó nhóm`;
  else if (act === "remove_admin" && members.length) text = `${actor} đã gỡ quyền phó nhóm của ${list}`;
  else if (act === "update_avatar") text = `${actor} đã đổi ảnh nhóm`;
  else if (act === "update" && groupName && groupName !== ctx.groupNameOf(groupId)) text = `${actor} đã đổi tên nhóm thành "${groupName}"`;
  if (!text) return null;

  const time = str(d?.time);
  return {
    // Sự kiện nhóm không có msgId: khóa khử trùng dựng từ nhóm + loại + giờ + người làm + người bị tác động
    msgId: `group-event:${groupId}:${act}:${time}:${actorId}:${members.map((m) => m.id).join(",")}`,
    cliMsgId: null,
    threadId: groupId,
    threadType: "group",
    senderId: DIGITS.test(actorId) ? actorId : groupId,
    // Chưa biết tên người làm thì để trống (không lấy mã số làm tên): lượt hỏi hồ sơ điền sau
    senderName: actor === "Bạn" || actor === actorId || actor === "Ai đó" ? null : actor,
    isSelf: actorId !== "" && actorId === ctx.selfUid,
    msgType: "group_event",
    text,
    quoteMsgId: null,
    sentAt: msToIso(time, ctx.receivedAt),
    attachments: [],
    rawJson: JSON.stringify(raw),
  };
}
