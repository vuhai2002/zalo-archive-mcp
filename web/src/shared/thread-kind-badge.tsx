import type { ThreadKind } from "../archive-api-types";
import { Badge } from "./ui-bits";

/** Tên hiển thị của hội thoại; kho chưa biết tên (người lạ, nhóm chưa đồng bộ) thì nói rõ */
export function threadDisplayName(name: string | null | undefined): string {
  return name?.trim() ? name : "(chưa rõ tên)";
}

/** Nhãn Nhóm / Bạn bè / Người lạ. `isFriend` không có (vd mục hàng đợi) thì chỉ phân nhóm/cá nhân */
export function ThreadKindBadge({ threadType, isFriend }: { threadType: ThreadKind; isFriend?: boolean }) {
  if (threadType === "group") return <Badge tone="blue" dot={false}>Nhóm</Badge>;
  if (isFriend === undefined) return <Badge tone="gray" dot={false}>Cá nhân</Badge>;
  return isFriend ? (
    <Badge tone="green" dot={false}>Bạn bè</Badge>
  ) : (
    <Badge tone="amber" dot={false}>Người lạ</Badge>
  );
}
