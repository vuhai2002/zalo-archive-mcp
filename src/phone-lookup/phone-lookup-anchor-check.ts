import type { DatabaseSync } from "node:sqlite";
import { latestFoundPhones, markLookupAttempt, markLookupFound, markLookupNoZalo } from "../storage/phone-lookup-store.js";
import type { PhoneLookupOutcome } from "../zalo/zca-phone-lookup-api.js";
import { classifyLookupError } from "./phone-lookup-rules.js";

/** Thử tối đa chừng này số mốc trước khi kết luận Zalo đang chặn tra (số mốc mới nhất có thể vừa tự ẩn tìm kiếm) */
const ANCHOR_COUNT = 2;

export type AnchorStepResult =
  /** Một số mốc vẫn ra người: Zalo không chặn, chuỗi "không có Zalo" là thật */
  | "ok"
  /** Mọi số mốc đều không ra (hoặc Zalo trả mã lạ): nghi bị chặn */
  | "blocked"
  /** Còn số mốc chưa thử, lượt sau tra tiếp */
  | "continue"
  /** Lỗi mạng: lượt sau thử lại đúng số mốc này */
  | "retry";

/**
 * Kiểm "Zalo có đang chặn tra không" sau một chuỗi dài "không có Zalo": tra lại các số đã biết là có Zalo, MỖI LƯỢT MỘT SỐ
 * MỐC (vòng tra gọi theo nhịp + trần ngày như mọi lượt tra, không gọi liền). Số mốc nào trả "không có Zalo" mà số mốc khác
 * vẫn ra thì số đó thật sự vừa ẩn tìm kiếm: ghi lại `no_zalo` cho nó.
 */
export class AnchorCheck {
  private anchors: string[] = [];
  private unsearchable: Array<{ phone: string; code: number | null; message: string }> = [];

  get active(): boolean {
    return this.anchors.length > 0;
  }

  /** Bắt đầu một đợt kiểm. Chưa có số nào tra ra người thì không kiểm được (trả false) */
  begin(db: DatabaseSync): boolean {
    this.anchors = latestFoundPhones(db, ANCHOR_COUNT);
    this.unsearchable = [];
    return this.active;
  }

  async step(db: DatabaseSync, lookup: (phone84: string) => Promise<PhoneLookupOutcome>, now: Date): Promise<AnchorStepResult> {
    const anchor = this.anchors[0]!;
    const iso = now.toISOString();
    markLookupAttempt(db, anchor, iso);
    let outcome: PhoneLookupOutcome;
    try {
      outcome = await lookup(anchor);
    } catch {
      return "retry";
    }
    if (outcome.kind === "found") {
      // Số mốc ẩn tìm kiếm ghi trước (giờ sớm hơn 1 ms) để số mốc vẫn ra là dòng mới nhất: chuỗi "không có Zalo" về 0
      const before = new Date(now.getTime() - 1).toISOString();
      for (const u of this.unsearchable) markLookupNoZalo(db, u.phone, u.code, u.message, before);
      markLookupFound(db, anchor, outcome.user, iso);
      this.anchors = [];
      return "ok";
    }
    if (classifyLookupError(outcome.code) !== "no_zalo") {
      this.anchors = [];
      return "blocked";
    }
    this.unsearchable.push({ phone: anchor, code: outcome.code, message: outcome.message });
    this.anchors.shift();
    return this.active ? "continue" : "blocked";
  }
}
