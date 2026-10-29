/**
 * Chặn dò mật khẩu dashboard: sai `maxFailures` lần trong `windowMs` thì khóa đăng
 * nhập `lockMs`. Một người dùng, chỉ nghe 127.0.0.1, nên đếm chung không theo IP.
 */
export class LoginAttemptLimiter {
  private failures: number[] = [];
  private lockedUntil = 0;

  constructor(
    private readonly opts: { maxFailures: number; windowMs: number; lockMs: number },
    private readonly now: () => number = Date.now,
  ) {}

  /** Số giây còn bị khóa; 0 = được thử */
  secondsLocked(): number {
    return Math.max(0, Math.ceil((this.lockedUntil - this.now()) / 1000));
  }

  recordFailure(): void {
    const t = this.now();
    this.failures = [...this.failures.filter((f) => t - f < this.opts.windowMs), t];
    if (this.failures.length >= this.opts.maxFailures) {
      this.lockedUntil = t + this.opts.lockMs;
      this.failures = [];
    }
  }

  recordSuccess(): void {
    this.failures = [];
  }
}
