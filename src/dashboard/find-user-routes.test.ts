import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { getPhoneLookups } from "../storage/phone-lookup-store.js";
import { upsertMessage } from "../storage/message-write-store.js";
import type { PhoneLookupOutcome } from "../zalo/zca-phone-lookup-api.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

const live = { source: "live" as const, receivedAt: "2026-03-10T07:00:00.000Z" };

async function setup() {
  const h = await createDashboardHarness();
  const calls: string[] = [];
  let answer: PhoneLookupOutcome | Error = { kind: "found", user: { uid: "u-lan", name: "Lan", avatarUrl: null } };
  h.state.phoneLookup = async (p) => {
    calls.push(p);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  h.state.listenerConnected = true;
  const cookie = await h.login();
  const search = async (phone: string) => (await h.call("/api/phone-search", { ...h.json({ phone }), cookie })).json() as Promise<Record<string, unknown>>;
  return { h, calls, cookie, search, setAnswer: (a: PhoneLookupOutcome | Error) => void (answer = a) };
}

describe("ô Tìm kiếm: gõ số điện thoại", () => {
  it("chưa tra: hỏi Zalo một lần, người tìm ra mở được hội thoại; gõ lại số đó thì lấy trong kho, không hỏi nữa", async () => {
    const { h, calls, cookie, search } = await setup();
    const r = await search("0900 000 001");
    assert.deepEqual(r, { status: "found", fromCache: false, user: { uid: "u-lan", name: "Lan", avatarUrl: null, isFriend: false, hasMessages: false } });
    assert.deepEqual(calls, ["84900000001"]);
    assert.equal((await search("+84900000001")).fromCache, true);
    assert.equal(calls.length, 1, "lần sau lấy trong kho");
    assert.equal((await h.call("/api/threads/u-lan/messages", { cookie })).status, 200, "mở được hội thoại dù chưa có tin");
  });

  it("không có Zalo thì nhớ một ngày; lỗi thì không để lại số chờ cho vòng tra lookup_phones", async () => {
    const { h, calls, search, setAnswer } = await setup();
    setAnswer({ kind: "zalo_error", code: 216, message: "khong co" });
    assert.deepEqual(await search("0900000002"), { status: "no_zalo" });
    assert.deepEqual(await search("0900000002"), { status: "no_zalo" });
    assert.equal(calls.length, 1);

    setAnswer(new Error("mat mang"));
    assert.equal((await search("0900000003")).status, "error");
    assert.deepEqual(getPhoneLookups(h.nick("test").db, ["84900000003"]), [], "không còn dòng chờ tra");
  });

  it("chưa kết nối, Chỉ đọc, số sai: không hỏi Zalo", async () => {
    const { h, calls, cookie, search } = await setup();
    h.state.listenerConnected = false;
    assert.equal((await search("0900000004")).status, "unavailable");
    h.state.listenerConnected = true;
    h.state.readOnly.add("test");
    assert.equal((await search("0900000004")).status, "unavailable");
    assert.equal((await h.call("/api/phone-search", { ...h.json({ phone: "123" }), cookie })).status, 400);
    assert.equal(calls.length, 0);
  });
});

describe("danh thiếp: nút Nhắn tin", () => {
  it("thêm người trên danh thiếp vào kho rồi trả mã hội thoại; tin không phải danh thiếp thì 404", async () => {
    const { h, cookie } = await setup();
    const { db } = h.nick("test");
    const content = { action: "recommened.user", params: "1000000000000000001", title: "Minh", thumb: "https://f1.zdn.vn/a.jpg", description: "{}" };
    upsertMessage(db, sampleMessage({ msgId: "1", cliMsgId: "c1", threadId: "u-khac", msgType: "chat.recommended", rawJson: JSON.stringify({ content }) }), live);
    upsertMessage(db, sampleMessage({ msgId: "2", cliMsgId: "c2", threadId: "u-khac", text: "Xin chào" }), live);
    const ids = db.prepare("SELECT id FROM messages ORDER BY id").all().map((r) => Number(r.id));
    const open = (id: number) => h.call(`/api/messages/${id}/contact-card/open`, { ...h.json({}), cookie });

    const res = await open(ids[0]!);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { threadId: "1000000000000000001" });
    assert.equal((await h.call("/api/threads/1000000000000000001/messages", { cookie })).status, 200);
    assert.equal((await open(ids[1]!)).status, 404);
  });
});
