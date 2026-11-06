import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { replaceContactAliases } from "./contact-alias-store.js";
import { upsertContacts } from "./contact-store.js";
import { readThread } from "./message-read-queries.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";

const live = { source: "live" as const, receivedAt: "2026-11-06T00:00:00.000Z" };

describe("đọc tin có nhắc tên", () => {
  it("chữ tin thường và chữ tin link: chỗ nhắc tô xanh, đổi sang tên đang dùng (tên gợi nhớ, rồi tên danh bạ); người lạ giữ chữ gốc", () => {
    const db = openArchiveDatabase(":memory:");
    upsertContacts(db, [{ userId: "849", displayName: "Lục Khuê Mẫn", avatarUrl: null }, { userId: "77", displayName: "Ngạn Quế Văn", avatarUrl: null }]);
    replaceContactAliases(db, [{ userId: "77", alias: "Chị Lan" }]);
    const text = "Dạ @Khuê Lục, @Lan, @Hà xem giúp :)";
    upsertMessage(
      db,
      sampleMessage({
        msgId: "1",
        text,
        rawJson: JSON.stringify({ mentions: [{ uid: "849", pos: 3, len: 9, type: 0 }, { uid: "77", pos: 14, len: 4, type: 0 }, { uid: "99", pos: 20, len: 3, type: 0 }] }),
      }),
      live,
    );
    const title = "Báo cáo xong @Khuê Lục\nhttps://docs.google.com/document/d/1/edit";
    upsertMessage(
      db,
      sampleMessage({
        msgId: "2",
        msgType: "chat.recommended",
        sentAt: "2026-10-28T03:01:00.000Z",
        text: title,
        rawJson: JSON.stringify({
          content: { action: "recommened.link", title, href: "https://docs.google.com/document/d/1/edit", params: "{}" },
          mentions: [{ uid: "849", pos: 13, len: 9, type: 0 }],
        }),
      }),
      live,
    );
    const [plain, link] = readThread(db, { threadId: "u-lan", threadType: "user", limit: 10 });
    assert.ok(plain!.text.startsWith("Dạ @Lục Khuê Mẫn, @Chị Lan, @Hà xem giúp"));
    const shown = (t: string, spans: Array<{ start: number; end: number; mention?: boolean }>) =>
      spans.filter((s) => s.mention).map((s) => t.slice(s.start, s.end));
    assert.deepEqual(shown(plain!.text, plain!.textStyles), ["@Lục Khuê Mẫn", "@Chị Lan", "@Hà"]);
    assert.equal(link!.link?.text, "Báo cáo xong @Lục Khuê Mẫn\nhttps://docs.google.com/document/d/1/edit");
    assert.deepEqual(shown(link!.link!.text, link!.link!.textStyles), ["@Lục Khuê Mẫn"]);
  });
});
