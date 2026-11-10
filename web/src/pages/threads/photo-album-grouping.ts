import type { ArchivedMessage } from "../../archive-api-types";

/**
 * Một mục trong khung chat: một tin, một album ảnh (nhiều tin ảnh gửi cùng lúc), hoặc một cụm sticker gửi liền nhau
 * (`stickers`, xem sticker-run-grouping.ts). `msg` luôn là tin đầu của mục.
 */
export type ChatItem = { msg: ArchivedMessage; album: ArchivedMessage[] | null; stickers?: ArchivedMessage[] | null };

/** Mọi tin của một mục (album: mọi ảnh, cụm sticker: mọi sticker) - để nhảy tới tin, tô sáng, chọn nhiều tin */
export const itemMessages = (item: ChatItem): ArchivedMessage[] => item.album ?? item.stickers ?? [item.msg];

const albumKey = (m: ArchivedMessage) => (m.album ? `${m.senderId}:${m.album.id}` : null);

/**
 * Gộp ảnh của cùng một album như Zalo: các tin ảnh cùng người gửi, cùng mã album (trong phần đã
 * tải) thành MỘT mục đặt ở chỗ ảnh tới đầu tiên, xếp theo vị trí trong album. Tin khác chen giữa
 * giữ nguyên chỗ. Album chỉ có một ảnh trong phần đã tải thì hiện như ảnh thường.
 */
export function collapseAlbums(messages: ArchivedMessage[]): ChatItem[] {
  const groups = new Map<string, ArchivedMessage[]>();
  for (const m of messages) {
    const key = albumKey(m);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  const placed = new Set<string>();
  const items: ChatItem[] = [];
  for (const m of messages) {
    const key = albumKey(m);
    const group = key ? groups.get(key) : undefined;
    if (!key || !group || group.length < 2) {
      items.push({ msg: m, album: null });
      continue;
    }
    if (placed.has(key)) continue;
    placed.add(key);
    items.push({ msg: m, album: [...group].sort((a, b) => a.album!.index - b.album!.index || a.id - b.id) });
  }
  return items;
}

/** Cảm xúc thả trên từng ảnh của album gộp thành một dải, theo loại */
export function mergeAlbumReactions(album: ArchivedMessage[]): ArchivedMessage["reactions"] {
  const byIcon = new Map<string, ArchivedMessage["reactions"][number]>();
  for (const r of album.flatMap((m) => m.reactions)) {
    const cur = byIcon.get(r.icon);
    if (!cur) byIcon.set(r.icon, { ...r, names: [...r.names] });
    else {
      cur.count += r.count;
      cur.mine ||= r.mine;
      for (const n of r.names) if (!cur.names.includes(n)) cur.names.push(n);
    }
  }
  return [...byIcon.values()];
}
