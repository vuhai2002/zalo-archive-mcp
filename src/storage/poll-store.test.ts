import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PollDetailRefresher } from "../daemon/poll-detail-refresher.js";
import { createSilentLogger } from "../shared/logger.js";
import { sampleMessage } from "./archive-store-test-helpers.js";
import { searchMessages } from "./message-search-queries.js";
import { upsertMessage } from "./message-write-store.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import { backfillPollMessages } from "./poll-message-backfill.js";
import { getPollActivity, getPollSnapshot, nextPollDue, savePollSnapshot } from "./poll-store.js";

const T0 = "2026-11-10T03:00:00.000Z";
const at = (sec: number) => new Date(Date.parse(T0) + sec * 1000);

/** Tin group.poll đúng hình dạng Zalo gửi (params là chuỗi JSON) */
const pollRaw = (action: string, pollId = 1100000001) =>
  JSON.stringify({
    uidFrom: "u-lan",
    dName: "Lan",
    content: { action, params: `{"msg":{"vi":"%1$s tham gia cuộc bình chọn: %2$s"},"question":"Ăn trưa ở đâu đây?","pollId":${pollId}}` },
  });
const pollMsg = (msgId: string, sentAt: string, text = "Lan tham gia cuộc bình chọn: Ăn trưa ở đâu đây?") =>
  sampleMessage({ msgId, threadId: "g-1", threadType: "group", msgType: "group.poll", text, sentAt, rawJson: pollRaw("vote") });

describe("bình chọn nhóm: kho + vòng lấy chi tiết", () => {
  it("tin bình chọn mới ghi hoạt động; chờ lắng 20 giây rồi mới tới lượt hỏi Zalo", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, pollMsg("1", T0), { source: "live", receivedAt: T0 });
    assert.deepEqual(getPollActivity(db, "1100000001"), { groupId: "g-1", question: "Ăn trưa ở đâu đây?", lastEventAt: T0 });
    assert.equal(nextPollDue(db, at(10)), null);
    assert.equal(nextPollDue(db, at(25)), "1100000001");
  });

  it("đã lấy rồi thì chỉ hỏi lại khi có hoạt động mới, và không quá một lần mỗi phút; lỗi thì thử lại sau vài giờ", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, pollMsg("1", T0), { source: "live", receivedAt: T0 });
    savePollSnapshot(db, "1100000001", { detailJson: "{}", error: null, fetchedAt: at(30).toISOString() });
    assert.equal(nextPollDue(db, at(200)), null);
    upsertMessage(db, pollMsg("2", at(40).toISOString()), { source: "live", receivedAt: T0 });
    assert.equal(nextPollDue(db, at(70)), null, "chưa đủ một phút từ lần lấy trước");
    assert.equal(nextPollDue(db, at(95)), "1100000001");
    savePollSnapshot(db, "1100000001", { detailJson: null, error: "Zalo lỗi", fetchedAt: at(100).toISOString() });
    assert.equal(getPollSnapshot(db, "1100000001")?.detailJson, "{}", "lỗi thì giữ chi tiết cũ");
    assert.equal(nextPollDue(db, at(3600)), null);
    assert.equal(nextPollDue(db, at(7 * 3600)), "1100000001");
  });

  it("tin bình chọn cũ (chữ [group.poll]) được sửa thành câu, tìm theo câu hỏi ra; chỉ chạy một lần", () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, pollMsg("1", T0, "[group.poll]"), { source: "live", receivedAt: T0 });
    db.prepare("DELETE FROM poll_activity").run();
    assert.deepEqual(backfillPollMessages(db, at(1)), { texts: 1, polls: 1 });
    assert.equal((db.prepare("SELECT text FROM messages WHERE msg_id = '1'").get() as { text: string }).text, "Lan tham gia cuộc bình chọn: Ăn trưa ở đâu đây?");
    assert.equal(searchMessages(db, { query: "an trua o dau day", limit: 5 }).length, 1);
    assert.ok(getPollActivity(db, "1100000001"));
    assert.deepEqual(backfillPollMessages(db, at(2)), { texts: 0, polls: 0 });
  });

  it("vòng lấy chi tiết: hỏi Zalo bằng mã số, lưu chi tiết; Zalo báo lỗi thì ghi lỗi", async () => {
    const db = openArchiveDatabase(":memory:");
    upsertMessage(db, pollMsg("1", T0), { source: "live", receivedAt: T0 });
    const asked: number[] = [];
    let fail = false;
    const fetchDetail = async (id: number) => {
      asked.push(id);
      if (fail) throw new Error("Không có quyền");
      return { question: "Ăn trưa ở đâu đây?", options: [] };
    };
    await new PollDetailRefresher({ db, log: createSilentLogger(), now: () => at(30), fetchDetail }).tick();
    assert.deepEqual(asked, [1100000001]);
    assert.deepEqual(JSON.parse(getPollSnapshot(db, "1100000001")!.detailJson!), { question: "Ăn trưa ở đâu đây?", options: [] });
    upsertMessage(db, pollMsg("2", at(31).toISOString()), { source: "live", receivedAt: T0 });
    fail = true;
    await new PollDetailRefresher({ db, log: createSilentLogger(), now: () => at(200), fetchDetail }).tick();
    assert.equal(getPollSnapshot(db, "1100000001")?.error, "Không có quyền");
  });
});
