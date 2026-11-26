/**
 * Ghi chú phát hành cho `pnpm release`, dựng từ dòng đầu các commit kể từ bản trước. Repo commit thẳng lên main (không qua
 * pull request) nên ghi chú tự sinh của GitHub (`--generate-notes`) chỉ còn dòng "Full Changelog" - dashboard không có gì
 * để hiện ở mục "Có gì mới". Lời commit viết theo hành vi (conventional commits) nên dùng thẳng được.
 */

const GROUPS: Array<{ title: string; types: string[] }> = [
  { title: "Tính năng mới", types: ["feat"] },
  { title: "Sửa lỗi", types: ["fix", "perf"] },
  { title: "Khác", types: ["docs", "refactor", "style", "build", "test", "chore"] },
];
const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;

/** `subjects`: dòng đầu các commit (mới trước hay cũ trước đều được, giữ thứ tự đưa vào); `compareUrl`: link so sánh hai bản */
export function buildReleaseNotes(subjects: string[], compareUrl: string | null): string {
  const grouped = new Map<string, string[]>();
  for (const subject of subjects) {
    const m = CONVENTIONAL.exec(subject.trim());
    if (!m) continue;
    const [, type, scope, text] = m;
    // Commit đổi version của chính lần phát hành, cập nhật thư viện: không phải thay đổi người dùng cần biết
    if (type === "chore" && (scope === "release" || scope === "deps")) continue;
    const group = GROUPS.find((g) => g.types.includes(type!));
    if (!group) continue;
    const line = text!.charAt(0).toUpperCase() + text!.slice(1);
    grouped.set(group.title, [...(grouped.get(group.title) ?? []), line]);
  }
  const sections = GROUPS.filter((g) => grouped.has(g.title)).map((g) => [`## ${g.title}`, ...grouped.get(g.title)!.map((l) => `- ${l}`)].join("\n"));
  if (sections.length === 0) sections.push("Bản sửa nhỏ, không có thay đổi đáng kể.");
  if (compareUrl) sections.push(`**Full Changelog**: ${compareUrl}`);
  return sections.join("\n\n");
}
