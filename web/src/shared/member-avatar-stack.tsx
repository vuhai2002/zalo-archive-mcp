import type { MemberAvatar } from "../archive-api-types";
import { ContactAvatar } from "./contact-avatar";

/**
 * Avatar ghép của nhóm không có ảnh riêng, như Zalo (khung 48x48):
 * - 2 người: xếp chéo; 3 người: một ở trên, hai ở dưới;
 * - đúng 4 người: lưới 2x2 đủ 4 avatar;
 * - từ 5 người: 3 avatar + ô cuối là TỔNG số thành viên (Zalo hiện "5" cho nhóm 5 người), quá 99 thì "99+".
 */
export function MemberAvatarStack({
  members,
  memberCount,
  seed,
}: {
  members: MemberAvatar[];
  memberCount: number | null;
  seed: string;
}) {
  const total = Math.max(memberCount ?? 0, members.length);
  const cell = (x: MemberAvatar, pos: string) => (
    <span key={x.userId} className={`absolute ${pos} rounded-full ring-2 ring-surface`}>
      <ContactAvatar name={x.name ?? "?"} seed={x.userId} url={x.avatarUrl} size="xs" />
    </span>
  );

  if (members.length <= 1) {
    const only = members[0];
    return <ContactAvatar name={only?.name ?? "?"} seed={only?.userId ?? seed} url={only?.avatarUrl} size="lg" />;
  }
  if (members.length === 2) {
    return (
      <span className="relative block h-12 w-12 shrink-0">
        {cell(members[0]!, "left-0 top-0")}
        {cell(members[1]!, "bottom-0 right-0")}
      </span>
    );
  }
  if (members.length === 3 || total <= 3) {
    return (
      <span className="relative block h-12 w-12 shrink-0">
        {cell(members[0]!, "left-1/2 top-0 -translate-x-1/2")}
        {cell(members[1]!, "bottom-0 left-0")}
        {cell(members[2]!, "bottom-0 right-0")}
      </span>
    );
  }
  const showCount = total > 4;
  return (
    <span className="relative block h-12 w-12 shrink-0">
      {cell(members[0]!, "left-0 top-0")}
      {cell(members[1]!, "right-0 top-0")}
      {cell(members[2]!, "bottom-0 left-0")}
      {showCount ? (
        <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 ring-2 ring-surface dark:bg-slate-700 dark:text-slate-200">
          {total > 99 ? "99+" : total}
        </span>
      ) : (
        members[3] && cell(members[3], "bottom-0 right-0")
      )}
    </span>
  );
}
