/**
 * Ghi chú phát hành (markdown của GitHub Release) hiện gọn: dòng `#` thành tiêu đề nhỏ, `-` / `*` thành gạch đầu dòng, link
 * `[chữ](url)` chỉ giữ chữ, `**đậm**` bỏ dấu sao. Chỉ dựng chữ thường (không HTML), nên nội dung lạ cũng không chèn được gì.
 */
const plain = (s: string) =>
  s
    // Ghi chú GitHub tự sinh: "feat: ... by @ai in https://.../pull/1" - bỏ phần đuôi người làm + link
    .replace(/\s+by @[\w-]+ in https?:\/\/\S+$/i, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

export function ReleaseNotesView({ notes }: { notes: string }) {
  const lines = notes
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !/^<!--.*-->$/.test(l.trim()) && !/^\**Full Changelog/i.test(l.trim()));
  return (
    <div className="space-y-1 text-[13px] leading-relaxed text-ink">
      {lines.map((line, i) => {
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        if (heading) return <div key={i} className="pt-1 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{plain(heading[1]!)}</div>;
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-zalo-500" />
              <span>{plain(bullet[1]!)}</span>
            </div>
          );
        }
        return <p key={i}>{plain(line)}</p>;
      })}
    </div>
  );
}
