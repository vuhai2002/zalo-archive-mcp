import type { PollPerson, PollView } from "../../archive-api-types";
import { ContactAvatar } from "../../shared/contact-avatar";
import { IconCheck } from "../../shared/dashboard-icons";

const nameOf = (p: PollPerson) => (p.isSelf ? "Bạn" : (p.name ?? "Thành viên"));

/**
 * Các phương án của một cuộc bình chọn như Zalo: thanh nền theo tỉ lệ người chọn, dấu tích ở phương án nick đang dùng đã chọn,
 * số phiếu bên phải. `variant="dialog"`: thêm avatar người chọn (tối đa 3 + "+N"); `showNames`: liệt kê tên dưới mỗi phương án.
 * Chỉ để xem - không bấm chọn được.
 */
export function PollOptionsList({ view, variant, showNames = false }: { view: PollView; variant: "card" | "dialog"; showNames?: boolean }) {
  return (
    <ul className="space-y-2">
      {view.options.map((o) => {
        const pct = view.voterCount > 0 ? Math.min(100, Math.round((o.votes / view.voterCount) * 100)) : 0;
        return (
          <li key={o.id}>
            <div className="flex items-center gap-3">
              <div
                className={`relative flex min-h-[42px] min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-lg px-3 py-2 ${o.votedByMe ? "bg-zalo-50 dark:bg-zalo-500/15" : "bg-tile"}`}
              >
                <div aria-hidden="true" className="absolute inset-y-0 left-0 bg-zalo-500/15" style={{ width: `${pct}%` }} />
                <span className="relative min-w-0 flex-1 text-[14px] leading-snug text-ink [overflow-wrap:anywhere]">{o.content}</span>
                {variant === "dialog" && o.voters.length > 0 && <VoterStack voters={o.voters} />}
                {o.votedByMe && (
                  <span title="Bạn đã chọn" className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zalo-500 text-white">
                    <IconCheck size={12} strokeWidth={3} />
                  </span>
                )}
              </div>
              <span className="w-7 shrink-0 text-right text-[14px] tabular-nums text-ink">{o.votes}</span>
            </div>
            {showNames && o.voters.length > 0 && <p className="mt-1 pl-3 text-[12.5px] text-ink-soft">{o.voters.map(nameOf).join(", ")}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function VoterStack({ voters }: { voters: PollPerson[] }) {
  const shown = voters.slice(0, 3);
  return (
    <span className="relative flex shrink-0 items-center" title={voters.map(nameOf).join(", ")}>
      {shown.map((p, i) => (
        <span key={p.userId} className={`rounded-full ring-2 ring-surface ${i > 0 ? "-ml-2" : ""}`}>
          <ContactAvatar name={nameOf(p)} seed={p.userId} url={p.avatarUrl} size="xs" />
        </span>
      ))}
      {voters.length > 3 && (
        <span className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-300 text-[11px] font-semibold text-slate-700 ring-2 ring-surface dark:bg-slate-600 dark:text-slate-100">
          +{voters.length - 3}
        </span>
      )}
    </span>
  );
}
