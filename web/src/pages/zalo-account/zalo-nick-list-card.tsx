import type { AccountSummary } from "../../archive-api-types";
import { IconQr } from "../../shared/action-and-media-icons";
import { ContactAvatar } from "../../shared/contact-avatar";
import { formatDateTime } from "../../shared/format-archive-time";
import { Badge, BTN_SECONDARY, EmptyState, LoadingText, SectionCard } from "../../shared/ui-bits";

export const nickLabel = (a: Pick<AccountSummary, "displayName" | "id">) => a.displayName ?? a.id;

/**
 * Danh sách nick đã từng đăng nhập trên máy này. Mỗi lúc chỉ một nick chạy; chuyển
 * nick không xóa gì - dữ liệu từng nick giữ riêng, quay lại thì nối tiếp.
 */
export function ZaloNickListCard({
  accounts,
  busy,
  canAdd,
  timeZone,
  onSwitch,
  onAdd,
}: {
  accounts: AccountSummary[] | null;
  busy: boolean;
  canAdd: boolean;
  timeZone: string;
  onSwitch: (a: AccountSummary) => void;
  onAdd: () => void;
}) {
  return (
    <SectionCard
      title="Các nick Zalo"
      subtitle="Mỗi lúc chỉ một nick nghe tin. Chuyển nick không xóa dữ liệu nick cũ."
      aside={
        canAdd && (
          <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={onAdd}>
            <IconQr size={16} /> Thêm nick khác
          </button>
        )
      }
    >
      {accounts === null ? (
        <LoadingText />
      ) : accounts.length === 0 ? (
        <EmptyState text="Chưa có nick nào - đăng nhập bằng QR để thêm nick đầu tiên." />
      ) : (
        <ul className="divide-y divide-line">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <ContactAvatar name={nickLabel(a)} seed={a.uid ?? a.id} url={a.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium text-ink">{nickLabel(a)}</div>
                <div className="truncate text-[12px] text-ink-soft">
                  {a.uid ? `uid ${a.uid}` : `thư mục ${a.id}`}
                  {a.lastActiveAt ? ` · dùng lần cuối ${formatDateTime(a.lastActiveAt, timeZone)}` : ""}
                  {!a.hasCredentials ? " · cần quét QR lại" : ""}
                </div>
              </div>
              {a.active ? (
                <Badge tone="blue">Đang dùng</Badge>
              ) : (
                <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => onSwitch(a)}>
                  Chuyển sang
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
