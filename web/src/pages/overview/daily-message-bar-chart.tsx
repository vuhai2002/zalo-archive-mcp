import type { DailyCount } from "../../archive-api-types";
import { formatNumber } from "../../shared/ui-bits";

/**
 * Biểu đồ cột chồng theo ngày: phần dưới là tin NHẬN, phần trên là tin GỬI.
 * Chồng thay vì đặt hai cột cạnh nhau: 30 ngày x 2 cột trên màn 375px thì mỗi
 * cột chỉ còn vài pixel; chồng lại thì vẫn đọc được tổng mỗi ngày bằng chiều cao.
 * HTML + CSS thuần - kéo cả thư viện chart vào cho ngần này là không đáng.
 */

const INCOMING = "bg-zalo-500/60";
const OUTGOING = "bg-amber-500";

/** Vẽ mỗi `n` cột một nhãn ngày, đủ thưa để không chồng chữ */
function labelStep(count: number): number {
  if (count <= 10) return 1;
  if (count <= 16) return 2;
  if (count <= 45) return 5;
  return 10;
}

/** Làm tròn đỉnh trục lên "số đẹp" để 4 vạch chia hết; tối thiểu 4 để dữ liệu toàn 0 vẫn có trục */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const step = max / 4;
  const mag = 10 ** Math.floor(Math.log10(step));
  const niceStep = [1, 2, 2.5, 5, 10].map((h) => mag * h).find((b) => b >= step) ?? step;
  return niceStep * 4;
}

export function DailyMessageBarChart({ data }: { data: DailyCount[] }) {
  if (data.length === 0) return <p className="py-10 text-center text-[14px] text-ink-soft/70">Chưa có dữ liệu.</p>;

  const top = niceMax(Math.max(...data.map((d) => d.incoming + d.outgoing), 0));
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((top / 4) * (4 - i)));
  const step = labelStep(data.length);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-[12px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${INCOMING}`} /> Tin nhận
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${OUTGOING}`} /> Tin gửi
        </span>
      </div>

      <div className="flex gap-3">
        <div className="flex h-48 w-10 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-ink-soft">
          {ticks.map((v, i) => (
            <span key={i} className="leading-none">
              {formatNumber(v)}
            </span>
          ))}
        </div>

        <div className="relative h-48 min-w-0 flex-1">
          {/* Lưới vẽ trước cột trong DOM nên nằm dưới - kẻ đè lên cột trông như bị gạch */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((_, i) => (
              <div key={i} className="border-t border-dashed border-line" />
            ))}
          </div>
          <div className="relative flex h-full items-end gap-[2px] sm:gap-1">
            {data.map((d) => {
              const total = d.incoming + d.outgoing;
              const height = top > 0 ? (total / top) * 100 : 0;
              return (
                <div
                  key={d.day}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  title={`${d.day}: nhận ${formatNumber(d.incoming)}, gửi ${formatNumber(d.outgoing)}`}
                >
                  {/* Ngày có tin mà cột thấp quá thì vẫn giữ tối thiểu 3px để không lẫn với ngày trống */}
                  <div
                    className="flex w-full max-w-[40px] flex-col-reverse overflow-hidden rounded-t-[4px]"
                    style={{ height: total > 0 ? `max(3px, ${height}%)` : "0" }}
                  >
                    <div className={INCOMING} style={{ flexGrow: d.incoming }} />
                    <div className={OUTGOING} style={{ flexGrow: d.outgoing }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Nhãn ngày tách khỏi vùng cột để mọi cột cùng đáy; w-10 + gap-3 khớp trục Y */}
      <div className="mt-2 flex gap-3">
        <div className="w-10 shrink-0" />
        <div className="flex min-w-0 flex-1 gap-[2px] border-t border-line pt-2 sm:gap-1">
          {data.map((d, i) => (
            <div key={d.day} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] tabular-nums text-ink-soft">
              {/* Luôn giữ nhãn CUỐI (hôm nay) rồi lùi dần theo bước */}
              {(data.length - 1 - i) % step === 0 ? `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}` : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
