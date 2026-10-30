/**
 * Câu thông báo giữa khung chat của nhóm, dựng như Zalo: "Quế Khuê được Mẫn Khuê thêm vào nhóm",
 * tên in đậm, avatar nhỏ của người được nhắc tới đứng trước. Hai nguồn:
 * - sự kiện nhóm của zca-js (thêm / rời / xóa / chặn / phó nhóm / đổi tên / đổi ảnh), lưu dạng tin
 *   `group_event` với dữ liệu gốc của sự kiện;
 * - tin `webchat` có `content.action = "msginfo.actionlist"` ("X vừa yêu cầu tham gia nhóm.",
 *   "X xác nhận: tham gia <lịch hẹn>."): Zalo gửi sẵn mẫu câu `%1$s` + tên cần in đậm.
 * Mẫu câu lấy từ chuỗi tiếng Việt của Zalo Web (STR_MSGINFO_*). Module thuần.
 */

export type NoticeSpan = { start: number; end: number };
export type SystemNotice = {
  text: string;
  /** Đoạn in đậm (tên người, tên nhóm, tên lịch hẹn) */
  bold: NoticeSpan[];
  /** Avatar đứng trước câu: người được nhắc tới (tra danh bạ theo `userId`) hoặc ảnh Zalo gửi kèm */
  avatar: { userId: string | null; url: string | null } | null;
};
export type NoticeNames = {
  selfUid: string | null;
  /** Tên để hiện của một người (tên gợi nhớ trước) - null nếu chưa biết */
  nameOf: (uid: string) => string | null;
};

/** Ghép câu từ các mảnh chữ thường + mảnh in đậm */
type Piece = string | { bold: string };
function compose(pieces: Piece[]): Pick<SystemNotice, "text" | "bold"> {
  let text = "";
  const bold: NoticeSpan[] = [];
  for (const p of pieces) {
    if (typeof p === "string") text += p;
    else if (p.bold) {
      bold.push({ start: text.length, end: text.length + p.bold.length });
      text += p.bold;
    }
  }
  return { text, bold };
}

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const DIGITS = /^\d+$/;
// Zalo liệt kê vài tên rồi gộp phần còn lại thành "và N người nữa"
const MAX_LISTED = 3;

type Person = { id: string; dName: string | null; avatar: string | null };

/** "Bạn" (đầu câu) / "bạn" (giữa câu) không in đậm; người khác in đậm theo tên */
function personPieces(p: Person, names: NoticeNames, atStart: boolean): Piece[] {
  if (p.id && p.id === names.selfUid) return [atStart ? "Bạn" : "bạn"];
  return [{ bold: names.nameOf(p.id) ?? p.dName ?? (p.id || "Ai đó") }];
}

function listPieces(people: Person[], names: NoticeNames): Piece[] {
  const shown = people.length > MAX_LISTED ? people.slice(0, MAX_LISTED) : people;
  const out: Piece[] = [];
  shown.forEach((p, i) => {
    if (i > 0) out.push(i === shown.length - 1 && shown.length === people.length ? " và " : ", ");
    out.push(...personPieces(p, names, i === 0));
  });
  if (people.length > shown.length) out.push(` và ${people.length - shown.length} người nữa`);
  return out;
}

const avatarOf = (p: Person | undefined): SystemNotice["avatar"] => (p ? { userId: p.id || null, url: p.avatar } : null);

/** Sự kiện nhóm (dữ liệu gốc zca-js `{act, data: {sourceId, updateMembers, groupName}}`) */
export function groupEventNoticeOf(raw: unknown, names: NoticeNames): SystemNotice | null {
  const e = raw as { act?: unknown; data?: Record<string, unknown> } | null;
  const d = e?.data;
  const act = str(e?.act);
  const members: Person[] = (Array.isArray(d?.updateMembers) ? (d.updateMembers as Array<Record<string, unknown>>) : [])
    .map((m) => ({ id: str(m?.id), dName: str(m?.dName).trim() || null, avatar: str(m?.avatar).trim() || null }))
    .filter((m) => DIGITS.test(m.id));
  const actorId = str(d?.sourceId);
  const actor: Person = members.find((m) => m.id === actorId) ?? { id: actorId, dName: null, avatar: null };
  const bySelf = actorId !== "" && actorId === names.selfUid;
  const list = listPieces(members, names);
  const byActor = bySelf ? ["bạn"] : personPieces(actor, names, false);
  const subjectNotice = (pieces: Piece[]) => ({ ...compose(pieces), avatar: avatarOf(members[0]) });
  const actorNotice = (pieces: Piece[]) => ({ ...compose(pieces), avatar: avatarOf(actor) });

  if (act === "join") {
    if (members.length === 0) return null;
    const selfJoined = members.length === 1 && (members[0]!.id === actorId || actorId === "");
    if (selfJoined) return subjectNotice([...list, " đã tham gia nhóm"]);
    return subjectNotice([...list, " được ", ...byActor, " thêm vào nhóm"]);
  }
  if (act === "leave") return members.length ? subjectNotice([...list, " đã rời khỏi nhóm"]) : actorNotice([...personPieces(actor, names, true), " đã rời khỏi nhóm"]);
  if (act === "remove_member" && members.length) return subjectNotice([...list, " được ", ...byActor, " xóa khỏi nhóm"]);
  if (act === "block_member" && members.length) return subjectNotice([...list, " bị ", ...byActor, " chặn khỏi nhóm này"]);
  if (act === "add_admin" && members.length) return subjectNotice([...list, " đã được bổ nhiệm thành phó nhóm"]);
  if (act === "remove_admin" && members.length) return subjectNotice([...list, " đã không còn là phó nhóm"]);
  if (act === "update_avatar") return actorNotice([...personPieces(actor, names, true), " đổi ảnh đại diện nhóm"]);
  const groupName = str(d?.groupName).trim();
  if (act === "update" && groupName) return actorNotice([...personPieces(actor, names, true), " đổi tên nhóm thành ", { bold: groupName }]);
  return null;
}

function parseObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v !== "string") return null;
  try {
    const o: unknown = JSON.parse(v);
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const MSGINFO_ACTION = "msginfo.actionlist";

/** Thông báo `msginfo.actionlist` (nội dung tin webchat): mẫu câu `%N$s` thay bằng tên in đậm */
export function msgInfoNoticeOf(content: unknown): SystemNotice | null {
  const c = parseObject(content);
  if (str(c?.action) !== MSGINFO_ACTION) return null;
  const p = parseObject(c?.params);
  const msg = parseObject(p?.msg);
  const template = str(msg?.vi).trim() || str(msg?.en).trim();
  const highlights = Array.isArray(p?.highLightsV2) ? (p.highLightsV2 as Array<Record<string, unknown>>) : [];
  const firstInfo = Array.isArray(p?.simpleInfos) ? (p.simpleInfos[0] as Record<string, unknown> | undefined) : undefined;
  // Mã người trong params là SỐ 19 chữ số (JSON.parse làm tròn mất) nên không tra danh bạ theo mã:
  // dùng thẳng ảnh Zalo gửi kèm (avatar người xin vào nhóm, hoặc biểu tượng lịch hẹn)
  const url = str(p?.avatarUrl).trim() || str(firstInfo?.avt).trim() || str(p?.iconUrl).trim() || null;
  const avatar = url ? { userId: null, url } : null;
  if (!template) {
    const title = str(c?.title).trim();
    return title ? { text: title, bold: [], avatar } : null;
  }
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of template.matchAll(/%(\d+)\$s/g)) {
    pieces.push(template.slice(last, m.index));
    pieces.push({ bold: str(highlights[Number(m[1]) - 1]?.dpn).trim() });
    last = m.index + m[0].length;
  }
  pieces.push(template.slice(last));
  return { ...compose(pieces), avatar };
}

/** Thông báo từ dữ liệu gốc đã lưu của một tin `group_event` (sự kiện nhóm hoặc tin msginfo) */
export function systemNoticeOf(rawJson: string | null, names: NoticeNames): SystemNotice | null {
  const raw = parseObject(rawJson);
  if (!raw) return null;
  if (raw.content !== undefined) return msgInfoNoticeOf(raw.content);
  return groupEventNoticeOf(raw, names);
}
