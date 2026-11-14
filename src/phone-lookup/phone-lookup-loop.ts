import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { AppEnv } from "../config/env-schema.js";
import { localHour, localHourTomorrowUtc, nextLocalHourUtc, startOfTodayUtc } from "../shared/local-date-range.js";
import {
  countLookupAttemptsSince,
  demoteToPending,
  getLookupPause,
  lastLookupAttemptAt,
  markLookupAttempt,
  markLookupDeferred,
  markLookupFound,
  markLookupNetworkError,
  markLookupNoZalo,
  nextPendingPhoneLookup,
  noZaloStreak,
  setLookupPause,
} from "../storage/phone-lookup-store.js";
import { getKillSwitch } from "../storage/send-control-store.js";
import { getSendSettings } from "../storage/send-settings-store.js";
import type { PhoneLookupOutcome } from "../zalo/zca-phone-lookup-api.js";
import { AnchorCheck } from "./phone-lookup-anchor-check.js";
import { classifyLookupError, localPhone } from "./phone-lookup-rules.js";

export type PhoneLookupFn = (phone84: string) => Promise<PhoneLookupOutcome>;
export type PhoneLookupWorkerDeps = {
  db: DatabaseSync;
  env: AppEnv;
  log: Logger;
  lookup: PhoneLookupFn;
  isReadOnly: () => boolean;
  isListenerConnected: () => boolean;
  now?: () => Date;
  random?: () => number;
};

const IDLE_MS = 5_000;
const BLOCKED_MS = 10_000;
/** Chờ dài nhất giữa hai lần kiểm, để mở khóa / sửa cài đặt có hiệu lực sớm */
const MAX_WAIT_MS = 60_000;
const NETWORK_RETRY_MS = 60_000;
const MAX_NETWORK_ATTEMPTS = 3;
/** Danh sách số người dùng đưa thường đa số có Zalo: chừng này số liền không có là đáng ngờ, tra lại số mốc */
const NO_ZALO_STREAK_LIMIT = 10;

/**
 * Vòng tra số điện thoại của daemon (lookup_phones xếp số, vòng này gọi Zalo). Mỗi lượt tra MỘT số, như người gõ số vào ô
 * Tìm kiếm: nhịp ngẫu nhiên, trần ngày, chỉ trong khung giờ của lô; Chỉ đọc / khóa khẩn cấp / listener rớt thì không gọi Zalo.
 * Không bao giờ bật khóa khẩn cấp: tra số không gửi gì cho ai. Mã lạ (có thể Zalo chặn tra) thì tạm dừng tới khung giờ ngày mai.
 */
export class PhoneLookupWorker {
  private gapMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly anchorCheck = new AnchorCheck();

  constructor(private readonly d: PhoneLookupWorkerDeps) {
    this.gapMs = this.newGap();
  }

  private now(): Date {
    return (this.d.now ?? (() => new Date()))();
  }

  private newGap(): number {
    const s = getSendSettings(this.d.db, this.d.env);
    const r = (this.d.random ?? Math.random)();
    return Math.round((s.lookupMinGapSeconds + r * (s.lookupMaxGapSeconds - s.lookupMinGapSeconds)) * 1000);
  }

  /** Một lượt. Trả số ms nên chờ trước lượt sau. */
  async tick(): Promise<number> {
    const { db, env } = this.d;
    const now = this.now();
    const waitUntil = (iso: string) => Math.min(MAX_WAIT_MS, Math.max(1_000, Date.parse(iso) - now.getTime()));
    const pause = getLookupPause(db);
    if (pause && Date.parse(pause.until) > now.getTime()) return waitUntil(pause.until);
    const next = nextPendingPhoneLookup(db);
    if (!next && !this.anchorCheck.active) return IDLE_MS;
    if (this.d.isReadOnly() || getKillSwitch(db).killed || !this.d.isListenerConnected()) return BLOCKED_MS;

    const s = getSendSettings(db, env);
    const tz = env.ARCHIVE_TIMEZONE;
    const hour = localHour(tz, now);
    if (hour < s.batchWindowStartHour || hour >= s.batchWindowEndHour) return waitUntil(nextLocalHourUtc(tz, s.batchWindowStartHour, now));
    if (countLookupAttemptsSince(db, startOfTodayUtc(tz, now)) >= s.lookupDailyCap) {
      return waitUntil(localHourTomorrowUtc(tz, s.batchWindowStartHour, now));
    }
    const last = lastLookupAttemptAt(db);
    const readyAt = (last ? Date.parse(last) : 0) + this.gapMs;
    if (readyAt > now.getTime()) return waitUntil(new Date(readyAt).toISOString());

    // Đang kiểm số mốc thì lượt này tra số mốc (theo nhịp + trần như mọi lượt), chưa tra số mới
    const wait = this.anchorCheck.active ? await this.anchorStep(now) : await this.lookupOne(next!.phone, now);
    this.gapMs = this.newGap();
    return wait;
  }

  private tomorrowWindow(now: Date): string {
    const s = getSendSettings(this.d.db, this.d.env);
    return localHourTomorrowUtc(this.d.env.ARCHIVE_TIMEZONE, s.batchWindowStartHour, now);
  }

  private async lookupOne(phone: string, now: Date): Promise<number> {
    const { db, log } = this.d;
    const iso = now.toISOString();
    markLookupAttempt(db, phone, iso);
    let outcome: PhoneLookupOutcome;
    try {
      outcome = await this.d.lookup(phone);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = markLookupNetworkError(db, phone, message, MAX_NETWORK_ATTEMPTS);
      log.warn({ err, status }, "Tra số hỏng (mạng / Zalo không trả lời)");
      return NETWORK_RETRY_MS;
    }
    if (outcome.kind === "found") {
      markLookupFound(db, phone, outcome.user, iso);
      return 0;
    }
    if (classifyLookupError(outcome.code) === "no_zalo") {
      markLookupNoZalo(db, phone, outcome.code, outcome.message, iso);
      // Zalo chặn tra có thể trả mã giống "không có Zalo": chuỗi dài thì các lượt sau tra lại số mốc
      if (noZaloStreak(db).length >= NO_ZALO_STREAK_LIMIT) this.anchorCheck.begin(db);
      return 0;
    }
    // Mã lạ (có thể Zalo đang chặn tra): số này xuống cuối hàng kèm mã để không chặn các số sau, cả vòng nghỉ tới ngày mai
    const status = markLookupDeferred(db, phone, outcome.code, outcome.message, iso, MAX_NETWORK_ATTEMPTS);
    const reason = `Zalo trả mã ${outcome.code ?? "không rõ"} khi tra số ${localPhone(phone)}: ${outcome.message}`;
    setLookupPause(db, this.tomorrowWindow(now), reason);
    log.warn({ code: outcome.code, status }, "Tra số: Zalo trả mã lạ - tạm dừng tra tới khung giờ ngày mai");
    return 0;
  }

  /**
   * Một lượt kiểm số mốc. Mọi số mốc đều không ra thì đưa chuỗi "không có Zalo" vừa rồi về chờ tra lại và tạm dừng tới ngày
   * mai, không ghi nhầm "không có Zalo" khi thật ra bị chặn.
   */
  private async anchorStep(now: Date): Promise<number> {
    const { db, log } = this.d;
    const result = await this.anchorCheck.step(db, this.d.lookup, now);
    if (result === "retry") return NETWORK_RETRY_MS;
    if (result !== "blocked") return 0;
    const streak = noZaloStreak(db);
    demoteToPending(db, streak);
    setLookupPause(db, this.tomorrowWindow(now), `Nghi Zalo đang chặn tra số: ${streak.length} số liền không có Zalo và các số mốc đã có Zalo cũng không ra`);
    log.warn({ count: streak.length }, "Tra số: nghi bị Zalo chặn - đưa chuỗi về chờ tra lại, tạm dừng tới ngày mai");
    return 0;
  }

  start(): void {
    const loop = async () => {
      if (this.stopped) return;
      let delay = IDLE_MS;
      try {
        delay = await this.tick();
      } catch (err) {
        this.d.log.error({ err }, "Vòng tra số gặp lỗi");
      }
      if (!this.stopped) this.timer = setTimeout(loop, delay);
    };
    this.timer = setTimeout(loop, 1_000);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
