import type { MemberAvatar } from "../archive-api-types";
import { ContactAvatar } from "./contact-avatar";

/** Cỡ khung ghép: "lg" 48px (danh sách hội thoại, kết quả tìm); "tiny" 26px (thông báo giữa khung chat, như Zalo PC) */
const SIZES = {
  lg: { box: "h-12 w-12", cell: "xs", ring: "ring-2 ring-surface", count: "h-7 w-7 text-[10px]", single: "lg" },
  tiny: { box: "h-[26px] w-[26px]", cell: "3xs", ring: "ring-1 ring-bubble", count: "h-[14px] w-[14px] text-[7px]", single: "2xs" },
} as const;

/**
 * Avatar ghép như Zalo, cho nhóm không có ảnh riêng và cho thông báo nhiều người ("A, B, C được X thêm vào nhóm"):
 * - 2 người: xếp chéo; 3 người: một ở trên, hai ở dưới;
 * - đúng 4 người: lưới 2x2 đủ 4 avatar;
 * - từ 5 người: 3 avatar + ô cuối là TỔNG số (Zalo hiện "9" khi thêm 9 người), quá 99 thì "99+".
 */
export function MemberAvatarStack({
  members,
  memberCount,
  seed,
  size = "lg",
}: {
  members: MemberAvatar[];
  memberCount: number | null;
  seed: string;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  const total = Math.max(memberCount ?? 0, members.length);
  const cell = (x: MemberAvatar, pos: string) => (
    <span key={x.userId} className={`absolute ${pos} rounded-full ${s.ring}`}>
      <ContactAvatar name={x.name ?? "?"} seed={x.userId} url={x.avatarUrl} size={s.cell} />
    </span>
  );
  const box = `relative block ${s.box} shrink-0`;

  if (members.length <= 1) {
    const only = members[0];
    return <ContactAvatar name={only?.name ?? "?"} seed={only?.userId ?? seed} url={only?.avatarUrl} size={s.single} />;
  }
  if (members.length === 2) {
    return (
      <span className={box}>
        {cell(members[0]!, "left-0 top-0")}
        {cell(members[1]!, "bottom-0 right-0")}
      </span>
    );
  }
  if (members.length === 3 || total <= 3) {
    return (
      <span className={box}>
        {cell(members[0]!, "left-1/2 top-0 -translate-x-1/2")}
        {cell(members[1]!, "bottom-0 left-0")}
        {cell(members[2]!, "bottom-0 right-0")}
      </span>
    );
  }
  const showCount = total > 4;
  return (
    <span className={box}>
      {cell(members[0]!, "left-0 top-0")}
      {cell(members[1]!, "right-0 top-0")}
      {cell(members[2]!, "bottom-0 left-0")}
      {showCount ? (
        <span
          className={`absolute bottom-0 right-0 flex items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200 ${s.count} ${s.ring}`}
        >
          {total > 99 ? "99+" : total}
        </span>
      ) : (
        members[3] && cell(members[3], "bottom-0 right-0")
      )}
    </span>
  );
}
