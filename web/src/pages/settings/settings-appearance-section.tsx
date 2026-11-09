import type { ReactNode } from "react";
import { IconMoon, IconSun } from "../../shared/dashboard-icons";
import { useTheme, type ThemeChoice } from "../../shared/use-theme";

const CHOICES: Array<[ThemeChoice, string, string]> = [
  ["light", "Sáng", "Nền trắng như Zalo"],
  ["dark", "Tối", "Nền tối, đỡ chói ban đêm"],
  ["system", "Theo hệ thống", "Đổi theo cài đặt sáng / tối của Windows"],
];

/** Cài đặt > Giao diện như Zalo PC: chọn Sáng, Tối hoặc Theo hệ thống (thay cho nút mặt trời / mặt trăng rời trước đây) */
export function AppearanceSection() {
  const { choice, choose } = useTheme();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h2 className="text-[18px] font-semibold text-ink">Giao diện</h2>
      <div role="radiogroup" aria-label="Chế độ giao diện" className="divide-y divide-line rounded-xl bg-surface shadow-sm">
        {CHOICES.map(([value, label, hint]) => (
          <Choice key={value} on={choice === value} onClick={() => choose(value)} icon={value === "dark" ? <IconMoon size={20} /> : <IconSun size={20} />}>
            <span className="block text-[15px] text-ink">{label}</span>
            <span className="block text-[13px] text-ink-soft">{hint}</span>
          </Choice>
        ))}
      </div>
    </div>
  );
}

function Choice({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-tile/60">
      <span className="text-ink-soft">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
      <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? "border-zalo-500" : "border-line"}`}>
        {on && <span className="h-2.5 w-2.5 rounded-full bg-zalo-500" />}
      </span>
    </button>
  );
}
