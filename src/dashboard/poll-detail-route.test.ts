import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertContacts } from "../storage/contact-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import { savePollSnapshot } from "../storage/poll-store.js";
import { setMeta } from "../storage/thread-directory-store.js";
import type { PollView, ThreadMessagesResponse } from "./dashboard-api-contract.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

const AT = "2026-11-10T03:00:00.000Z";
const raw = JSON.stringify({
  uidFrom: "u-lan",
  dName: "Ngạn Zalo",
  content: { action: "vote", params: '{"msg":{"vi":"%1$s tham gia cuộc bình chọn: %2$s"},"question":"Ăn trưa ở đâu đây?","pollId":1100000001}' },
});

/** Nhóm g-1 có một tin bình chọn của Lan (danh bạ đặt tên gợi nhớ "Chị Lan"); nick đang dùng là u-me */
async function setup() {
  const h = await createDashboardHarness();
  const db = h.nick("test").db;
  setMeta(db, "self_uid", "u-me");
  upsertContacts(db, [
    { userId: "u-lan", displayName: "Chị Lan", avatarUrl: "https://s.zalo.me/lan.jpg" },
    { userId: "u-me", displayName: "Tôi", avatarUrl: null },
  ]);
  const msg = sampleMessage({ msgId: "1", threadId: "g-1", threadType: "group", senderId: "u-lan", msgType: "group.poll", text: "x", sentAt: AT, rawJson: raw });
  upsertMessage(db, msg, { source: "live", receivedAt: AT });
  return { ...h, db, cookie: await h.login() };
}

describe("bình chọn trên dashboard (chỉ xem)", () => {
  it("đọc hội thoại: tin bình chọn thành câu như Zalo (tên theo danh bạ) kèm mã để mở cửa sổ Xem", async () => {
    const h = await setup();
    const r = (await (await h.call("/api/threads/g-1/messages?type=group", { cookie: h.cookie })).json()) as ThreadMessagesResponse;
    const m = r.messages.find((x) => x.msgId === "1")!;
    assert.equal(m.text, "Chị Lan tham gia cuộc bình chọn: Ăn trưa ở đâu đây?");
    assert.deepEqual(m.poll, { pollId: "1100000001", action: "vote" });
  });

  it("chưa lấy chi tiết: pending + câu hỏi; lấy rồi: phương án, số phiếu, người chọn có tên + avatar, phương án mình chọn", async () => {
    const h = await setup();
    const pending = (await (await h.call("/api/polls/1100000001", { cookie: h.cookie })).json()) as PollView;
    assert.deepEqual([pending.status, pending.question, pending.options.length], ["pending", "Ăn trưa ở đâu đây?", 0]);
    savePollSnapshot(h.db, "1100000001", {
      detailJson: JSON.stringify({
        creator: "u-lan",
        question: "Ăn trưa ở đâu đây?",
        allow_multi_choices: true,
        closed: false,
        num_vote: 2,
        created_time: 1700000000000,
        options: [
          { option_id: 11, content: "Đi", votes: 2, voted: true, voters: ["u-lan", "u-me"] },
          { option_id: 12, content: "Không đi", votes: 0, voted: false, voters: [] },
        ],
      }),
      error: null,
      fetchedAt: AT,
    });
    const v = (await (await h.call("/api/polls/1100000001", { cookie: h.cookie })).json()) as PollView;
    assert.equal(v.status, "ready");
    assert.equal(v.creator?.name, "Chị Lan");
    assert.deepEqual([v.allowMultiChoices, v.voterCount, v.voteCount], [true, 2, 2]);
    assert.deepEqual(v.options.map((o) => [o.content, o.votes, o.votedByMe]), [["Đi", 2, true], ["Không đi", 0, false]]);
    assert.deepEqual(v.options[0]!.voters.map((p) => [p.name, p.isSelf]), [["Chị Lan", false], ["Tôi", true]]);
  });

  it("mã lạ: 400; kho chưa thấy cuộc này: 404", async () => {
    const h = await setup();
    assert.equal((await h.call("/api/polls/abc", { cookie: h.cookie })).status, 400);
    assert.equal((await h.call("/api/polls/42", { cookie: h.cookie })).status, 404);
  });
});
