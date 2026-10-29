import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openArchiveDatabase } from "../storage/open-archive-database.js";
import { pickRenewedUrl, readRenewReply, renewableMediaType, renewMsgInfoFromRawJson } from "./media-link-renewal-request.js";
import { allocateRenewSlot } from "./media-link-renew-schedule.js";

describe("yêu cầu xin lại link media", () => {
  it("msgInfo dựng như Zalo Web: ảnh có link thường / HD / nhỏ / gốc; file có url; thiếu thì dùng link đang tải", () => {
    const photo = JSON.stringify({
      content: { href: "https://p.zdn.vn/jpg/a.jpg", thumb: "https://p.zdn.vn/thumb/a.jpg", params: JSON.stringify({ hd: "https://p.zdn.vn/hd/a.jpg" }) },
    });
    assert.deepEqual(renewMsgInfoFromRawJson("photo", photo, "https://khac"), {
      normalUrl: "https://p.zdn.vn/jpg/a.jpg",
      hdUrl: "https://p.zdn.vn/hd/a.jpg",
      thumbUrl: "https://p.zdn.vn/thumb/a.jpg",
      oriUrl: "https://p.zdn.vn/hd/a.jpg",
      url: "https://p.zdn.vn/hd/a.jpg",
    });
    const file = JSON.stringify({ content: { href: "https://f.dlfl.vn/a", title: "hợp đồng.pdf" } });
    assert.deepEqual(renewMsgInfoFromRawJson("file", file, "https://khac"), { url: "https://f.dlfl.vn/a", title: "hợp đồng.pdf" });
    assert.deepEqual(renewMsgInfoFromRawJson("video", "không phải json", "https://v.zdn.vn/x"), { videoUrl: "https://v.zdn.vn/x", renewType: 1 });
  });

  it("đọc phản hồi: ảnh normal / hd / thumb, file fileUrl, hẹn trả sau (async); không có gì thì null", () => {
    assert.deepEqual(readRenewReply({ normal: "https://a/n", hd: "https://a/hd", thumb: "https://a/t", destId: "1" }), {
      kind: "urls",
      bag: { normalUrl: "https://a/n", hdUrl: "https://a/hd", thumbUrl: "https://a/t" },
    });
    assert.deepEqual(readRenewReply({ data: JSON.stringify({ fileUrl: "https://f/1" }) }), { kind: "urls", bag: { normalUrl: "https://f/1" } });
    assert.deepEqual(readRenewReply({ async: true }), { kind: "async" });
    assert.equal(readRenewReply({ data: { url: "javascript:alert(1)" } }), null);
    assert.equal(readRenewReply(null), null);
  });

  it("ảnh ưu tiên bản to nhất, file lấy link thường; chỉ file / ảnh / video được xin lại", () => {
    const bag = { normalUrl: "https://n", hdUrl: "https://hd", thumbUrl: "https://t" };
    assert.equal(pickRenewedUrl("photo", bag), "https://hd");
    assert.equal(pickRenewedUrl("file", bag), "https://n");
    assert.equal(pickRenewedUrl("video", { thumbUrl: "https://t" }), null);
    assert.deepEqual(["file", "photo", "video", "gif", "voice"].map(renewableMediaType), [1, 2, 5, null, null]);
  });
});

describe("lượt xin lại link", () => {
  const pacing = { minGapSeconds: 4, maxGapSeconds: 10, dailyCap: 3, timeZone: "Asia/Ho_Chi_Minh" };

  it("các lượt cách nhau trong [min, max] giây; quá trần ngày thì sang đầu ngày sau (giờ kho)", () => {
    const db = openArchiveDatabase(":memory:");
    const now = new Date("2026-10-29T08:00:00.000Z"); // 15:00 giờ VN
    const slots = [0, 1, 2, 3].map(() => allocateRenewSlot(db, pacing, now, () => 0.5));
    assert.equal(slots[0]!.toISOString(), now.toISOString());
    assert.equal(slots[1]!.getTime() - slots[0]!.getTime(), 7_000);
    assert.equal(slots[2]!.getTime() - slots[1]!.getTime(), 7_000);
    // Lượt thứ 4 vượt trần 3/ngày: 00:00 ngày 30/10 giờ VN = 29/10 17:00 UTC, cộng một khoảng cách
    assert.equal(slots[3]!.toISOString(), "2026-10-29T17:00:07.000Z");
    // Thời gian đã qua lượt cuối: lượt mới không lùi về trước "bây giờ"
    const later = new Date("2026-10-31T00:00:00.000Z");
    assert.equal(allocateRenewSlot(db, pacing, later, () => 0).toISOString(), later.toISOString());
  });
});
