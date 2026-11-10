import type { ArchivedMessage } from "../../archive-api-types";

/** Từ bao nhiêu dòng bình chọn liền nhau thì gộp (như Zalo PC: nhiều người lần lượt bình chọn chỉ hiện dòng mới nhất) */
export const POLL_RUN_MIN = 3;

/** Vai trò của một tin trong một chuỗi dòng bình chọn được gộp: ẩn, hoặc dòng cuối (hiện kèm "Xem thêm" ở trên) */
export type PollRunRole = { runStart: number; role: "hidden" | "last"; hiddenCount: number };

/**
 * Chuỗi tin bình chọn liền nhau (tham gia, đổi lựa chọn, khóa...; KHÔNG tính tin tạo - có thẻ bình chọn riêng) dài từ
 * POLL_RUN_MIN: các dòng trước bị ẩn, dòng cuối hiện kèm nút "Xem thêm (N)". Khóa theo mã tin; `runStart` = mã tin đầu chuỗi
 * để nhớ chuỗi nào đã mở. Module thuần.
 */
export function foldablePollRuns(msgs: Array<Pick<ArchivedMessage, "id" | "msgType" | "poll">>): Map<number, PollRunRole> {
  const out = new Map<number, PollRunRole>();
  let run: number[] = [];
  const flush = () => {
    if (run.length >= POLL_RUN_MIN) {
      const runStart = run[0]!;
      const hiddenCount = run.length - 1;
      run.forEach((id, i) => out.set(id, { runStart, role: i === run.length - 1 ? "last" : "hidden", hiddenCount }));
    }
    run = [];
  };
  for (const m of msgs) {
    if (m.msgType === "group.poll" && m.poll?.action !== "create") run.push(m.id);
    else flush();
  }
  flush();
  return out;
}
