import type { ReactNode } from "react";
import type { IconFn } from "./dashboard-icons";

/** Mảnh UI dùng chung theo mẫu zalo-agent: badge chấm màu, stat card, panel, tile, nút */

export type BadgeTone = "blue" | "gray" | "green" | "red" | "amber";

/**
 * Lớp nút dùng lại - chép tay từng chỗ thì sớm muộn lệch padding/màu giữa các
 * trang. Cỡ và kiểu tách riêng: nối thêm `px-3` vào sau một chuỗi đã có `px-4`
 * KHÔNG đè được (Tailwind xếp thứ tự CSS theo utility, không theo thứ tự chữ
 * trong className), nên đổi cỡ phải qua tham số chứ không nối chuỗi.
 */
const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-50";
const BTN_KIND = {
  primary: "bg-zalo-500 text-white hover:bg-zalo-600",
  secondary: "border border-line bg-surface text-ink hover:bg-tile",
  /** Nút bật/tắt đang ở trạng thái bật (vd "Hẹn giờ" khi khung hẹn giờ đang mở) */
  selected: "border border-zalo-500 bg-zalo-50 text-zalo-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
const BTN_SIZE = { sm: "px-3 py-1.5", md: "px-4 py-2", lg: "px-4 py-2.5" };

export function btnClass(kind: keyof typeof BTN_KIND, size: keyof typeof BTN_SIZE = "md"): string {
  return `${BTN_BASE} ${BTN_KIND[kind]} ${BTN_SIZE[size]}`;
}

export const BTN_PRIMARY = btnClass("primary");
export const BTN_SECONDARY = btnClass("secondary");
export const BTN_DANGER = btnClass("danger");
export const BTN_ICON =
  "inline-flex items-center justify-center rounded-lg p-1.5 text-ink-soft hover:bg-tile hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Núm gạt bật/tắt. `inline-block` là bắt buộc: span mặc định là inline, mà
 * width/height KHÔNG áp dụng cho inline element - đặt trong nút thường là co về 0.
 */
export function ToggleKnob({ on, tone = "blue" }: { on: boolean; tone?: "blue" | "red" }) {
  const onColor = tone === "red" ? "bg-red-600" : "bg-zalo-500";
  return (
    <span
      className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${on ? onColor : "bg-slate-300 dark:bg-slate-600"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </span>
  );
}

export function Badge({ tone, dot = true, children }: { tone: BadgeTone; dot?: boolean; children: ReactNode }) {
  const tones = {
    blue: { chip: "bg-zalo-50 text-zalo-700 border-zalo-100", dot: "bg-zalo-500" },
    gray: { chip: "bg-tile text-ink-soft border-line", dot: "bg-slate-400 dark:bg-slate-500" },
    green: {
      chip: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/50",
      dot: "bg-emerald-500",
    },
    red: {
      chip: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-100 dark:border-red-900/50",
      dot: "bg-red-500",
    },
    amber: {
      chip: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-900/50",
      dot: "bg-amber-500",
    },
  }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${tones.chip}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${tones.dot}`} />}
      {children}
    </span>
  );
}

/** Stat card: icon box góc trên, label nhỏ, số to, dòng phụ */
export function StatCard({ icon: Icon, label, value, sub }: { icon: IconFn; label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="gc-card flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-tile text-ink">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] leading-tight text-ink-soft">{label}</div>
          <div className="mt-1 text-[26px] font-semibold leading-none text-ink">{value}</div>
          {sub && <div className="mt-1.5 text-[12px] text-ink-soft">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

/** Panel lớn có header icon + title (+ subtitle) + slot phải */
export function SectionCard({
  icon: Icon,
  title,
  subtitle,
  aside,
  children,
}: {
  icon?: IconFn;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="gc-card min-w-0 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zalo-50 text-zalo-500">
              <Icon size={19} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-soft">{subtitle}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Tile nhỏ: label + value (+ gợi ý). Giá trị đứng trên mô tả - mắt bắt số trước. */
export function InfoTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="gc-tile min-w-0">
      <div className="text-[12px] text-ink-soft">{label}</div>
      <div className="mt-0.5 break-words text-[15px] font-semibold text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-soft/80">{hint}</div>}
    </div>
  );
}

export type AvatarSize = "xs" | "sm" | "md" | "lg";
export const AVATAR_SIZE_CLASS: Record<AvatarSize, string> = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-[13px]",
  lg: "h-12 w-12 text-[16px]",
};

/** Hai chữ cái đầu như Zalo: "Khúc Mẫn" -> "KM", "Lan" -> "L"; bỏ từ không có chữ/số ("Tôi (demo)" -> "TD") */
function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const first = [...(words[0] ?? "?")][0] ?? "?";
  const last = words.length > 1 ? ([...words[words.length - 1]!][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Avatar tròn chữ cái đầu, nền chuyển màu - màu sinh từ chuỗi để ổn định giữa các lần render */
export function InitialAvatar({ name, seed, size = "md" }: { name: string; seed: string; size?: AvatarSize }) {
  const palette = [
    "from-indigo-500 to-violet-500",
    "from-sky-500 to-blue-600",
    "from-teal-400 to-emerald-600",
    "from-rose-400 to-pink-600",
    "from-amber-400 to-orange-500",
    "from-fuchsia-500 to-purple-600",
  ];
  const hash = [...seed].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return (
    <span
      className={`flex ${AVATAR_SIZE_CLASS[size]} shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ${palette[hash % palette.length]}`}
    >
      {initialsOf(name)}
    </span>
  );
}

export function LoadingText({ text = "Đang tải..." }: { text?: string }) {
  return <p className="animate-pulse py-6 text-center text-[14px] text-ink-soft">{text}</p>;
}

/** Khung lỗi đỏ nhạt, có nút thử lại tùy chọn */
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
      <span className="min-w-0 break-words">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
          Thử lại
        </button>
      )}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="py-10 text-center text-[14px] text-ink-soft/70">{text}</p>;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("vi-VN");
}
