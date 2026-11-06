import { Worker } from "node:worker_threads";

/**
 * Đổi ảnh JPEG XL sang PNG ở luồng phụ (worker_threads) thay vì luồng chính của daemon. Một ảnh 2560x1920 mất
 * vài giây (phần lớn là mã hóa PNG); làm ở luồng chính thì dashboard, listener, hàng đợi gửi đứng theo từng ấy.
 *
 * Pool mở tối đa `size` luồng, mỗi luồng đổi một ảnh một lúc, ảnh dư xếp hàng. Luồng rảnh quá `idleMs` thì tắt
 * để trả bộ nhớ WASM (giải mã một ảnh lớn chiếm vài chục MB), có ảnh mới thì mở lại. Luồng chết giữa chừng
 * (vd hết bộ nhớ) thì ảnh đang đổi báo lỗi, ảnh sau đổi ở luồng mới.
 */
type Job = { bytes: Uint8Array; resolve: (png: Uint8Array) => void; reject: (err: Error) => void };
type Slot = { worker: Worker; job: Job | null; idleTimer: ReturnType<typeof setTimeout> | null };
type WorkerReply = { png?: Uint8Array; error?: string };

/** Luồng rảnh chừng này thì tắt: đủ dài để không mở / tắt liên tục giữa hai ảnh, đủ ngắn để trả bộ nhớ sớm */
const IDLE_MS = 30_000;
const WORKER_URL = new URL("./jxl-png-convert-worker.ts", import.meta.url);

export class JxlPngWorkerPool {
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  private closed = false;

  constructor(
    readonly size: number,
    private readonly idleMs = IDLE_MS,
  ) {
    if (!Number.isInteger(size) || size < 1) throw new Error(`Số luồng đổi JXL phải là số nguyên >= 1 (nhận ${size})`);
  }

  /** Đổi một ảnh JXL sang PNG; lỗi khi không phải JXL hợp lệ, ảnh quá cỡ hoặc luồng chết */
  convert(bytes: Uint8Array): Promise<Uint8Array> {
    if (this.closed) return Promise.reject(new Error("Pool đổi JXL đã đóng"));
    return new Promise((resolve, reject) => {
      this.queue.push({ bytes, resolve, reject });
      this.pump();
    });
  }

  /** Số luồng đang mở (để test và log) */
  get openWorkers(): number {
    return this.slots.length;
  }

  /** Tắt mọi luồng; ảnh đang chờ báo lỗi */
  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.queue.splice(0)) job.reject(new Error("Pool đổi JXL đã đóng"));
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
  }

  private pump(): void {
    while (this.queue.length > 0 && !this.closed) {
      const slot = this.slots.find((s) => !s.job) ?? (this.slots.length < this.size ? this.spawn() : null);
      if (!slot) return;
      this.run(slot, this.queue.shift()!);
    }
  }

  private spawn(): Slot {
    const worker = new Worker(WORKER_URL);
    const slot: Slot = { worker, job: null, idleTimer: null };
    worker.on("message", (reply: WorkerReply) => {
      const job = slot.job;
      slot.job = null;
      if (job) {
        if (reply.png) job.resolve(reply.png);
        else job.reject(new Error(reply.error ?? "Luồng đổi JXL trả kết quả rỗng"));
      }
      this.pump();
      if (!slot.job) this.markIdle(slot);
    });
    worker.on("error", (err) => this.drop(slot, err));
    worker.on("exit", (code) => this.drop(slot, new Error(`Luồng đổi JXL dừng giữa chừng (mã ${code})`)));
    this.slots.push(slot);
    return slot;
  }

  private run(slot: Slot, job: Job): void {
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    slot.idleTimer = null;
    slot.job = job;
    // Đang đổi thì giữ tiến trình sống (test, lệnh chạy một lần); rảnh thì không giữ
    slot.worker.ref();
    slot.worker.postMessage(job.bytes);
  }

  private markIdle(slot: Slot): void {
    slot.worker.unref();
    slot.idleTimer = setTimeout(() => void slot.worker.terminate(), this.idleMs);
    slot.idleTimer.unref();
  }

  /** Bỏ luồng đã chết / đã tắt khỏi pool; ảnh nó đang đổi (nếu có) báo lỗi, ảnh chờ chuyển sang luồng khác */
  private drop(slot: Slot, err: Error): void {
    const i = this.slots.indexOf(slot);
    if (i < 0) return;
    this.slots.splice(i, 1);
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    const job = slot.job;
    slot.job = null;
    job?.reject(err);
    this.pump();
  }
}

let shared: JxlPngWorkerPool | null = null;

/**
 * Pool dùng chung cả tiến trình (tải media và lấy từ Zalo PC cùng dùng), để tổng số luồng đổi JXL không vượt
 * `size`. Lần gọi đầu quyết định số luồng; mọi nơi gọi đều truyền cùng giá trị `JXL_CONVERT_WORKERS`.
 */
export function sharedJxlPngPool(size: number): JxlPngWorkerPool {
  shared ??= new JxlPngWorkerPool(size);
  return shared;
}
