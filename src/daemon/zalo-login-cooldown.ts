/** Vừa đăng nhập xong mà lại đòi đăng nhập: chặn, Zalo dễ nghi là máy khi đăng nhập dồn dập */
export class LoginCooldownError extends Error {
  constructor(readonly secondsLeft: number) {
    super(`Vừa đăng nhập Zalo xong - đợi ${secondsLeft} giây nữa rồi thử lại (tránh đăng nhập dồn dập, Zalo dễ nghi là máy)`);
  }
}

/**
 * Nhịp đăng nhập Zalo: hai lần đăng nhập (bằng cookie, hoặc quét QR xong) cách nhau
 * tối thiểu `cooldownMs`. Tạo mã QR thì chỉ KIỂM (bị chặn nếu vừa đăng nhập) chứ không
 * tính là một lần: mã hết hạn / bấm nhầm từ chối thì tạo lại được ngay, vì lần nào
 * cũng cần người thật cầm điện thoại quét.
 */
export class ZaloLoginCooldown {
  private lastLoginAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly cooldownMs: number,
    private readonly now: () => number,
  ) {}

  /** Ném LoginCooldownError nếu chưa đủ nhịp */
  assertAllowed(): void {
    const waitMs = this.cooldownMs - (this.now() - this.lastLoginAt);
    if (waitMs > 0) throw new LoginCooldownError(Math.ceil(waitMs / 1000));
  }

  markLogin(): void {
    this.lastLoginAt = this.now();
  }
}
