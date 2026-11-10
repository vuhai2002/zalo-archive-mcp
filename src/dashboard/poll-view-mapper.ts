import type { DatabaseSync } from "node:sqlite";
import { getPollActivity, getPollSnapshot } from "../storage/poll-store.js";
import { getMeta } from "../storage/thread-directory-store.js";
import type { PollPerson, PollView } from "./poll-view-contract.js";

/** Dạng chi tiết Zalo trả (getPollDetail của zca-js) - chỉ các trường dùng tới, đọc phòng thủ vì là dữ liệu ngoài */
type RawPollOption = { content?: unknown; votes?: unknown; voted?: unknown; voters?: unknown; option_id?: unknown };
type RawPoll = {
  creator?: unknown;
  question?: unknown;
  options?: unknown;
  closed?: unknown;
  allow_multi_choices?: unknown;
  is_anonymous?: unknown;
  created_time?: unknown;
  expired_time?: unknown;
  num_vote?: unknown;
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
/** Mốc thời gian Zalo: mili giây (đôi khi giây); 0 / thiếu = không có */
function isoOf(v: unknown): string | null {
  const n = num(v);
  if (n <= 0) return null;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

function parseDetail(json: string | null): RawPoll | null {
  if (!json) return null;
  try {
    const o: unknown = JSON.parse(json);
    return o && typeof o === "object" ? (o as RawPoll) : null;
  } catch {
    return null;
  }
}

/** Chi tiết một cuộc bình chọn cho cửa sổ Xem: mã người -> tên (tên gợi nhớ trước) + avatar theo danh bạ; null = kho chưa biết cuộc này */
export function toPollView(db: DatabaseSync, pollId: string): PollView | null {
  const activity = getPollActivity(db, pollId);
  const snapshot = getPollSnapshot(db, pollId);
  if (!activity && !snapshot) return null;
  const detail = parseDetail(snapshot?.detailJson ?? null);
  const selfUid = getMeta(db, "self_uid");
  const contact = db.prepare("SELECT COALESCE(alias, display_name) AS name, avatar_url FROM contacts WHERE user_id = ?");
  const person = (uid: unknown): PollPerson | null => {
    const id = typeof uid === "string" || typeof uid === "number" ? String(uid) : "";
    if (!id) return null;
    const c = contact.get(id) as { name: string | null; avatar_url: string | null } | undefined;
    return { userId: id, name: c?.name ?? null, avatarUrl: c?.avatar_url ?? null, isSelf: id === selfUid };
  };
  const rawOptions = Array.isArray(detail?.options) ? (detail.options as RawPollOption[]) : [];
  const options = rawOptions.map((o) => ({
    id: num(o.option_id),
    content: typeof o.content === "string" ? o.content : "",
    votes: num(o.votes),
    votedByMe: o.voted === true,
    voters: (Array.isArray(o.voters) ? o.voters : []).map(person).filter((p): p is PollPerson => p !== null),
  }));
  const distinctVoters = new Set(options.flatMap((o) => o.voters.map((v) => v.userId))).size;
  return {
    pollId,
    status: detail ? "ready" : snapshot?.error ? "error" : "pending",
    question: (typeof detail?.question === "string" && detail.question) || activity?.question || "",
    creator: person(detail?.creator),
    createdAt: isoOf(detail?.created_time),
    expiresAt: isoOf(detail?.expired_time),
    allowMultiChoices: detail?.allow_multi_choices === true,
    isAnonymous: detail?.is_anonymous === true,
    closed: detail?.closed === true,
    voterCount: num(detail?.num_vote) || distinctVoters,
    voteCount: options.reduce((s, o) => s + o.votes, 0),
    options,
    fetchedAt: snapshot?.fetchedAt ?? null,
    error: snapshot?.error ?? null,
  };
}
