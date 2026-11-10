/**
 * Cửa sổ "Xem" bình chọn trên dashboard (chỉ xem, kho không bình chọn).
 * GET /api/polls/:pollId -> PollView | 404 (kho chưa thấy cuộc bình chọn này)
 * Chi tiết do daemon lấy từ Zalo (getPollDetail) sau mỗi đợt hoạt động: `status` "pending" = chưa lấy được lần nào,
 * "error" = lần lấy gần nhất hỏng và chưa có chi tiết cũ (vd nhóm đã rời).
 */
export type PollPerson = { userId: string; name: string | null; avatarUrl: string | null; isSelf: boolean };

export type PollOptionView = {
  id: number;
  content: string;
  votes: number;
  /** Nick đang dùng đã chọn phương án này */
  votedByMe: boolean;
  /** Rỗng khi bình chọn ẩn danh */
  voters: PollPerson[];
};

export type PollView = {
  pollId: string;
  status: "ready" | "pending" | "error";
  question: string;
  creator: PollPerson | null;
  createdAt: string | null;
  /** Hạn bình chọn (null = không có hạn) */
  expiresAt: string | null;
  allowMultiChoices: boolean;
  isAnonymous: boolean;
  closed: boolean;
  /** Số người đã bình chọn */
  voterCount: number;
  /** Tổng số lượt chọn (chọn nhiều phương án thì lớn hơn số người) */
  voteCount: number;
  options: PollOptionView[];
  fetchedAt: string | null;
  error: string | null;
};
