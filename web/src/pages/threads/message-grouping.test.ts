import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArchivedMessage } from "../../archive-api-types";
import { chatDayLabel, layoutMessages } from "./message-grouping";

const TZ = "Asia/Ho_Chi_Minh";
const NOW = new Date("2037-10-29T05:00:00.000Z"); // 12:00 ngày 29/10 giờ VN

let nextId = 1;
const msg = (sentAt: string, who: "me" | "lan", msgType = "webchat"): ArchivedMessage => ({
  id: nextId++,
  msgId: String(nextId),
  threadId: "u-lan",
  threadType: "user",
  senderId: who === "me" ? "u-me" : "u-lan",
  senderName: null,
  senderAvatarUrl: null,
  isSelf: who === "me",
  msgType,
  text: "x",
  quoteMsgId: null,
  sentAt,
  recalledAt: null,
  source: "live",
  textStyles: [],
  reactions: [],
  attachments: [],
});

describe("bố cục khung chat kiểu Zalo", () => {
  it("dải ngày: Hôm nay, Hôm qua, còn lại là thứ + ngày", () => {
    assert.equal(chatDayLabel("2037-10-29T01:00:00.000Z", TZ, NOW), "Hôm nay");
    assert.equal(chatDayLabel("2037-10-28T17:30:00.000Z", TZ, NOW), "Hôm nay", "17:30 UTC ngày 28 = 00:30 ngày 29 giờ VN");
    assert.equal(chatDayLabel("2037-10-28T16:30:00.000Z", TZ, NOW), "Hôm qua", "16:30 UTC ngày 28 = 23:30 ngày 28 giờ VN");
    assert.equal(chatDayLabel("2037-10-28T03:00:00.000Z", TZ, NOW), "Hôm qua");
    assert.match(chatDayLabel("2037-10-22T03:00:00.000Z", TZ, NOW), /22\/10\/2037$/);
  });

  it("tin liên tiếp cùng người trong vài phút thành một cụm; đổi người, cách lâu, tin hệ thống hay sang ngày thì tách", () => {
    const list = [
      msg("2037-10-29T03:28:00.000Z", "lan", "chat.ecard"),
      msg("2037-10-29T03:28:30.000Z", "me"),
      msg("2037-10-29T03:29:00.000Z", "me"),
      msg("2037-10-29T03:29:30.000Z", "lan"),
      msg("2037-10-29T03:31:00.000Z", "lan"),
      msg("2037-10-29T03:50:00.000Z", "lan"),
    ];
    const l = layoutMessages(list, TZ, NOW);
    assert.deepEqual(
      l.map((x) => [x.firstInGroup, x.lastInGroup]),
      [
        [true, true],
        [true, false],
        [false, true],
        [true, false],
        [false, true],
        [true, true],
      ],
    );
    assert.deepEqual(
      l.map((x) => x.dayLabel),
      ["Hôm nay", null, null, null, null, null],
    );
  });
});
