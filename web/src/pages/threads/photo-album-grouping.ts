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
 * Gộp ảnh / video của cùng một chùm như Zalo PC: các tin cùng người gửi, cùng mã chùm tới LIỀN nhau thành MỘT mục
 * (đặt ở chỗ món tới đầu tiên), xếp theo vị trí trong chùm. Có tin khác chen giữa (vd một tin chữ tới lúc chùm
 * còn đang tới) thì tách: các món trước tin đó một khung, các món sau một khung khác - đúng như Zalo PC hiện. Một
 * khúc chỉ có một món thì hiện như ảnh / video thường.
 */
export function collapseAlbums(messages: ArchivedMessage[]): ChatItem[] {
  const items: ChatItem[] = [];
  let run: ArchivedMessage[] = [];
  const flush = () => {
    if (run.length >= 2) items.push({ msg: run[0]!, album: [...run].sort((a, b) => a.album!.index - b.album!.index || a.id - b.id) });
    else for (const m of run) items.push({ msg: m, album: null });
    run = [];
  };
  for (const m of messages) {
    const key = albumKey(m);
    if (key && run.length > 0 && albumKey(run[0]!) === key) {
      run.push(m);
      continue;
    }
    flush();
    if (key) run = [m];
    else items.push({ msg: m, album: null });
  }
  flush();
  return items;
}

/**
 * Cảm xúc trên các món của chùm gộp thành một dải, theo loại. Bấm cảm xúc lên chùm thì Zalo gắn lần bấm đó vào MỌI món của
 * khung, nên số đếm là số lần bấm khác nhau (theo `tapIds`), không cộng số của từng món: bấm tim 2 lần lên khung 10 món là
 * ❤️ 2 như Zalo PC, không phải 20. Lần bấm chỉ gắn vào một món riêng vẫn được đếm.
 */
export function mergeAlbumReactions(album: ArchivedMessage[]): ArchivedMessage["reactions"] {
  const byIcon = new Map<string, ArchivedMessage["reactions"][number]>();
  for (const r of album.flatMap((m) => m.reactions)) {
    const cur = byIcon.get(r.icon);
    if (!cur) {
      byIcon.set(r.icon, { ...r, names: [...r.names], tapIds: [...new Set(r.tapIds)] });
      continue;
    }
    cur.mine ||= r.mine;
    for (const n of r.names) if (!cur.names.includes(n)) cur.names.push(n);
    for (const t of r.tapIds) if (!cur.tapIds.includes(t)) cur.tapIds.push(t);
  }
  return [...byIcon.values()].map((s) => ({ ...s, count: s.tapIds.length }));
}
