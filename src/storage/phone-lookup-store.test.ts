import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { startOfTodayUtc } from "../shared/local-date-range.js";
import { findThread, listThreads } from "./message-read-queries.js";
import { openArchiveDatabase } from "./open-archive-database.js";
import {
  cancelPendingPhoneLookups,
  countLookupAttemptsSince,
  demoteToPending,
  getLookupPause,
  getPhoneLookups,
  latestFoundPhones,
  markLookupAttempt,
  markLookupDeferred,
  markLookupFound,
  markLookupNetworkError,
  markLookupNoZalo,
  nextPendingPhoneLookup,
  noZaloStreak,
  queuePhoneLookups,
  requeuePhoneLookups,
  setLookupPause,
} from "./phone-lookup-store.js";
import { replaceFriendDirectory } from "./thread-directory-store.js";

const P1 = "84900000001";
const P2 = "84900000002";
const P3 = "84900000003";
// Hôm qua 10:00 / 11:00, hôm nay 10:00 / 11:00 giờ VN
const T0 = "2026-03-09T03:00:00.000Z";
const T1 = "2026-03-09T04:00:00.000Z";
const T2 = "2026-03-10T03:00:00.000Z";
const T3 = "2026-03-10T04:00:00.000Z";
const START_OF_TODAY = startOfTodayUtc("Asia/Ho_Chi_Minh", new Date(T2));

let db = openArchiveDatabase(":memory:");
beforeEach(() => {
  db = openArchiveDatabase(":memory:");
});

describe("hàng đợi tra số", () => {
  it("xếp số mới, không xếp lại số đã có", () => {
    assert.equal(queuePhoneLookups(db, [P1, P2], T0), 2);
    assert.equal(queuePhoneLookups(db, [P1], T1), 0);
    assert.equal(nextPendingPhoneLookup(db)?.phone, P1);
    assert.equal(getPhoneLookups(db, [P1])[0]?.status, "pending");
  });

  it("số xếp trước tra trước", () => {
    queuePhoneLookups(db, [P2], T0);
    queuePhoneLookups(db, [P1], T1);
    assert.equal(nextPendingPhoneLookup(db)?.phone, P2);
  });

  it("tìm thấy thì findThread thấy người đó nhưng listThreads không hiện", () => {
    queuePhoneLookups(db, [P1], T0);
    markLookupFound(db, P1, { uid: "u-lan", name: "Lan", avatarUrl: null }, T1);
    const row = getPhoneLookups(db, [P1])[0];
    assert.deepEqual([row?.status, row?.userId, row?.zaloName, row?.checkedAt], ["found", "u-lan", "Lan", T1]);
    assert.deepEqual([findThread(db, "u-lan")?.name, findThread(db, "u-lan")?.isFriend], ["Lan", false]);
    assert.equal(listThreads(db, { limit: 50 }).some((t) => t.threadId === "u-lan"), false);
    assert.equal(nextPendingPhoneLookup(db), null);
  });

  it("không ghi đè tên hội thoại đã có", () => {
    replaceFriendDirectory(db, [{ threadId: "u-lan", name: "Lan" }]);
    queuePhoneLookups(db, [P1], T0);
    markLookupFound(db, P1, { uid: "u-lan", name: "Minh", avatarUrl: null }, T1);
    assert.deepEqual([findThread(db, "u-lan")?.name, findThread(db, "u-lan")?.isFriend], ["Lan", true]);
  });

  it("không có Zalo thì lưu mã và câu", () => {
    queuePhoneLookups(db, [P1], T0);
    markLookupNoZalo(db, P1, 216, "User không hợp lệ", T1);
    const row = getPhoneLookups(db, [P1])[0];
    assert.deepEqual([row?.status, row?.resultCode, row?.resultMessage], ["no_zalo", 216, "User không hợp lệ"]);
  });

  it("lỗi mạng lần thứ 3 thành failed", () => {
    queuePhoneLookups(db, [P1], T0);
    const statuses = [1, 2, 3].map(() => {
      markLookupAttempt(db, P1, T1);
      return markLookupNetworkError(db, P1, "timeout", 3);
    });
    assert.deepEqual(statuses, ["pending", "pending", "failed"]);
    assert.equal(getPhoneLookups(db, [P1])[0]?.resultMessage, "timeout");
  });

  it("requeue đưa no_zalo / failed về pending, cancel chỉ xóa pending", () => {
    queuePhoneLookups(db, [P1, P2, P3], T0);
    markLookupNoZalo(db, P1, 216, "User không hợp lệ", T1);
    markLookupFound(db, P2, { uid: "u-lan", name: "Lan", avatarUrl: null }, T1);
    assert.equal(requeuePhoneLookups(db, [P1, P2], T2), 1);
    assert.equal(getPhoneLookups(db, [P1])[0]?.attempts, 0);
    assert.equal(cancelPendingPhoneLookups(db, [P1, P2, P3]), 2);
    assert.deepEqual(getPhoneLookups(db, [P1, P2, P3]).map((r) => r.phone), [P2]);
  });

  it("noZaloStreak dừng ở dòng found gần nhất, latestFoundPhone là số found mới nhất", () => {
    queuePhoneLookups(db, [P1, P2, P3], T0);
    markLookupFound(db, P1, { uid: "u-lan", name: "Lan", avatarUrl: null }, T1);
    markLookupNoZalo(db, P2, 216, "User không hợp lệ", T2);
    markLookupNoZalo(db, P3, 212, "Không tìm thấy", T3);
    assert.deepEqual(noZaloStreak(db), [P3, P2]);
    assert.deepEqual(latestFoundPhones(db, 2), [P1]);
    demoteToPending(db, [P3, P2]);
    assert.deepEqual(getPhoneLookups(db, [P2, P3]).map((r) => r.status), ["pending", "pending"]);
    assert.deepEqual(noZaloStreak(db), []);
  });

  it("countLookupAttemptsSince đếm từng lần gọi Zalo kể từ mốc", () => {
    queuePhoneLookups(db, [P1, P2], T0);
    markLookupAttempt(db, P1, T1);
    markLookupAttempt(db, P2, T2);
    assert.equal(countLookupAttemptsSince(db, START_OF_TODAY), 1);
  });

  it("gọi lại cùng một số trong ngày vẫn tính thêm lượt", () => {
    queuePhoneLookups(db, [P1], T0);
    markLookupAttempt(db, P1, T2);
    markLookupAttempt(db, P1, T3);
    assert.equal(countLookupAttemptsSince(db, START_OF_TODAY), 2);
  });

  it("mã lạ: số xuống cuối hàng kèm mã; đủ lượt thì failed", () => {
    queuePhoneLookups(db, [P1, P2], T0);
    markLookupAttempt(db, P1, T2);
    assert.equal(markLookupDeferred(db, P1, 313, "Tìm quá nhiều lần", T2, 3), "pending");
    assert.equal(nextPendingPhoneLookup(db)?.phone, P2);
    assert.deepEqual([getPhoneLookups(db, [P1])[0]?.resultCode, getPhoneLookups(db, [P1])[0]?.resultMessage], [313, "Tìm quá nhiều lần"]);
    markLookupAttempt(db, P1, T3);
    markLookupAttempt(db, P1, T3);
    assert.equal(markLookupDeferred(db, P1, 313, "Tìm quá nhiều lần", T3, 3), "failed");
  });

  it("latestFoundPhones: số có Zalo mới nhất trước", () => {
    queuePhoneLookups(db, [P1, P2], T0);
    markLookupFound(db, P1, { uid: "u-lan", name: "Lan", avatarUrl: null }, T1);
    markLookupFound(db, P2, { uid: "u-binh", name: "Bình", avatarUrl: null }, T2);
    assert.deepEqual(latestFoundPhones(db, 2), [P2, P1]);
    assert.deepEqual(latestFoundPhones(db, 1), [P2]);
  });

  it("ghi và đọc trạng thái tạm dừng", () => {
    assert.equal(getLookupPause(db), null);
    setLookupPause(db, T3, "Zalo trả mã 313");
    assert.deepEqual(getLookupPause(db), { until: T3, reason: "Zalo trả mã 313" });
  });
});
