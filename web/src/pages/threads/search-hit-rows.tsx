import type { ReactNode } from "react";
import type { SearchResult, ThreadListItem } from "../../archive-api-types";
import { unavailableFileLabel } from "../../shared/archive-status-labels";
import { ContactAvatar } from "../../shared/contact-avatar";
import { FileTypeBadge } from "../../shared/file-type-badge";
import { formatFileSize } from "../../shared/format-file-size";
import { formatDayMonthYear } from "../../shared/format-archive-time";
import { highlightMatches } from "../../shared/highlight-search-match";
import { MemberAvatarStack } from "../../shared/member-avatar-stack";
import { snippetAround } from "../../shared/search-snippet";
import { ThreadAvatar } from "../../shared/thread-avatar";
import { threadDisplayName } from "../../shared/thread-kind-badge";
import { zaloListTime } from "../../shared/zalo-list-time-and-preview";

/**
 * Các dòng kết quả tìm kiếm kiểu Zalo, dùng chung cho tìm chung (cột trái) và tìm trong một hội thoại
 * (bảng bên phải): tin nhắn (đoạn trích quanh chữ khớp, tô xanh), file (ô màu theo loại, dung lượng,
 * người gửi, ngày) và liên hệ.
 */
const ROW = "flex w-full gap-3 px-4 py-2.5 text-left hover:bg-tile/70";

export const senderLabel = (m: SearchResult) => (m.isSelf ? "Bạn" : m.senderName?.trim() || m.senderId);

/**
 * Một tin khớp. `inThread`: đang tìm trong một hội thoại - avatar + tên là NGƯỜI GỬI (như Zalo);
 * tìm chung thì avatar + tên là HỘI THOẠI, dòng dưới mở đầu bằng tên người gửi.
 */
export function MessageHitRow({
  m,
  query,
  timeZone,
  inThread = false,
  onClick,
}: {
  m: SearchResult;
  query: string;
  timeZone: string;
  inThread?: boolean;
  onClick: () => void;
}) {
  const title = inThread ? (m.isSelf ? m.senderName?.trim() || "Bạn" : senderLabel(m)) : threadDisplayName(m.threadName);
  // Tìm chung: avatar của HỘI THOẠI, nhóm không có ảnh riêng thì ghép avatar thành viên như danh sách hội thoại
  const thread = {
    threadId: m.threadId,
    threadType: m.threadType,
    name: m.threadName,
    avatarUrl: m.threadAvatarUrl,
    memberAvatars: m.threadMemberAvatars ?? [],
    memberCount: m.threadMemberCount ?? null,
  };
  return (
    <li>
      <button type="button" onClick={onClick} className={`${ROW} items-start`}>
        {inThread ? <ContactAvatar name={title} seed={m.senderId} url={m.senderAvatarUrl} size="lg" /> : <ThreadAvatar t={thread} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-soft">{title}</span>
            <span className="shrink-0 text-[12px] text-ink-soft">{zaloListTime(m.sentAt, timeZone)}</span>
          </span>
          <span className="mt-0.5 line-clamp-2 text-[14.5px] leading-snug text-ink [overflow-wrap:anywhere]">
            {!inThread && `${senderLabel(m)}: `}
            {highlightMatches(snippetAround(m.text, query), query)}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Một file khớp tên: ô màu theo loại, tên (tô chữ khớp), "dung lượng - người gửi", ngày gửi */
export function FileHitRow({ m, query, timeZone, onClick }: { m: SearchResult; query: string; timeZone: string; onClick: () => void }) {
  const file = m.attachments.find((a) => a.kind === "file");
  const name = file?.fileName ?? m.text;
  const sender = m.isSelf ? m.senderName?.trim() || "Bạn" : senderLabel(m);
  // File không xem được (Zalo đã xóa, tải hỏng...): báo ngay ở đây cho khỏi bấm vào mới biết
  const unavailable = file ? unavailableFileLabel(file) : null;
  return (
    <li>
      <button type="button" onClick={onClick} className={`${ROW} items-center`}>
        <span className={unavailable ? "opacity-40" : ""}>
          <FileTypeBadge name={name} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14.5px] font-medium ${unavailable ? "text-ink-soft" : "text-ink"}`}>
            {highlightMatches(snippetAround(name, query, 14), query)}
          </span>
          <span className="mt-0.5 flex justify-between gap-2 text-[12.5px] text-ink-soft">
            <span className="min-w-0 truncate">
              {unavailable ? <span className="font-medium text-red-500 dark:text-red-400">{unavailable} - </span> : file?.sizeBytes ? `${formatFileSize(file.sizeBytes)} - ` : ""}
              {sender}
            </span>
            <span className="shrink-0">{formatDayMonthYear(m.sentAt, timeZone)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/** Một hội thoại khớp tên (mục Liên hệ): avatar + tên tô chữ khớp */
export function ContactHitRow({
  t,
  query,
  onClick,
  trailing,
}: {
  t: Pick<ThreadListItem, "threadId" | "threadType" | "name" | "avatarUrl"> & Partial<Pick<ThreadListItem, "memberAvatars" | "memberCount">>;
  query: string;
  onClick: () => void;
  /** Nút phụ hiện khi rê chuột (vd xóa khỏi "Tìm gần đây") */
  trailing?: ReactNode;
}) {
  const name = threadDisplayName(t.name);
  return (
    <li className="group relative">
      <button type="button" onClick={onClick} className={`${ROW} items-center`}>
        {t.threadType === "group" && !t.avatarUrl && t.memberAvatars?.length ? (
          <MemberAvatarStack members={t.memberAvatars} memberCount={t.memberCount ?? null} seed={t.threadId} />
        ) : (
          <ContactAvatar name={name} seed={t.threadId} url={t.avatarUrl} size="lg" />
        )}
        <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{query ? highlightMatches(name, query) : name}</span>
      </button>
      {trailing}
    </li>
  );
}

/** Nút to cuối mỗi mục như Zalo: "Xem tất cả tin nhắn", "Xem thêm"... */
export function WideButton({ label, onClick, busy = false }: { label: string; onClick: () => void; busy?: boolean }) {
  return (
    <div className="px-4 pb-3 pt-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full rounded-md bg-tile py-2 text-[14.5px] font-semibold text-ink hover:bg-line disabled:opacity-60"
      >
        {busy ? "Đang tải..." : label}
      </button>
    </div>
  );
}
