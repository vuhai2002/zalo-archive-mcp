import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleMessage } from "../storage/archive-store-test-helpers.js";
import { upsertMessage } from "../storage/message-write-store.js";
import type { AuthStatusResponse, SessionStatus } from "./dashboard-api-contract.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

describe("dashboard: tạo mật khẩu lần đầu", () => {
  it("chưa có mật khẩu: báo cần tạo; nhập lại sai thì 400; tạo xong là đăng nhập luôn; tạo lần hai 409", async () => {
    const h = await createDashboardHarness({ passwordSet: false });
    const status = async (cookie?: string) => (await (await h.call("/api/auth/status", { cookie })).json()) as AuthStatusResponse;
    assert.deepEqual(await status(), { passwordSet: false, loggedIn: false });
    assert.equal((await h.call("/api/auth/login", h.json({ password: "gi-cung-duoc" }))).status, 409);
    assert.equal((await h.call("/api/threads")).status, 401, "chưa có mật khẩu thì không route nào mở");

    const mismatch = await h.call("/api/auth/setup", h.json({ password: "mat-khau-moi", confirm: "mat-khau-khac" }));
    assert.equal(mismatch.status, 400);
    assert.match(((await mismatch.json()) as { error: string }).error, /không khớp/);
    assert.equal((await h.call("/api/auth/setup", h.json({ password: "ngan", confirm: "ngan" }))).status, 400);

    const ok = await h.call("/api/auth/setup", h.json({ password: "mật khẩu mới", confirm: "mật khẩu mới" }));
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get("set-cookie")!.split(";")[0]!;
    assert.deepEqual(await status(cookie), { passwordSet: true, loggedIn: true });
    assert.equal((await h.call("/api/threads", { cookie })).status, 200);

    const again = await h.call("/api/auth/setup", h.json({ password: "chiem-quyen-123", confirm: "chiem-quyen-123" }));
    assert.equal(again.status, 409, "đã có mật khẩu thì không ai tạo đè được");
    assert.equal((await h.call("/api/auth/login", h.json({ password: "chiem-quyen-123" }))).status, 401);
  });

  it("sai mật khẩu 5 lần thì khóa đăng nhập một lúc, kể cả nhập đúng", async () => {
    const h = await createDashboardHarness();
    for (let i = 0; i < 5; i++) assert.equal((await h.call("/api/auth/login", h.json({ password: `sai-${i}` }))).status, 401);
    const locked = await h.call("/api/auth/login", h.json({ password: "mat-khau-dai" }));
    assert.equal(locked.status, 429);
    assert.match(((await locked.json()) as { error: string }).error, /thử lại sau \d+ giây/);
  });
});

describe("dashboard: nick Zalo", () => {
  it("chưa có nick: route kho trả 409 có hướng dẫn, phiên vẫn xem được", async () => {
    const h = await createDashboardHarness({ accountIds: [] });
    const cookie = await h.login();
    const res = await h.call("/api/threads", { cookie });
    assert.equal(res.status, 409);
    assert.match(((await res.json()) as { error: string }).error, /quét QR|QR/);
    const session = (await (await h.call("/api/session", { cookie })).json()) as SessionStatus;
    assert.equal(session.account, null);
  });

  it("đổi nick: route kho đọc DB của nick mới; nick lạ 404", async () => {
    const h = await createDashboardHarness({ accountIds: ["nick-phu", "nick-chinh"] });
    upsertMessage(h.nick("nick-chinh").db, sampleMessage(), { source: "live", receivedAt: "2026-10-28T03:00:00.000Z" });
    const cookie = await h.login();
    const total = async () => ((await (await h.call("/api/threads", { cookie })).json()) as { total: number }).total;
    assert.equal(await total(), 0);

    const sw = await h.call("/api/accounts/nick-chinh/activate", { ...h.json({}), cookie });
    assert.equal(sw.status, 200);
    assert.equal(((await sw.json()) as SessionStatus).account?.id, "nick-chinh");
    assert.equal(await total(), 1);
    assert.equal((await h.call("/api/accounts/khong-co/activate", { ...h.json({}), cookie })).status, 404);
  });

  it("vừa đăng nhập Zalo xong mà bấm Chạy: 429 kèm số giây phải đợi", async () => {
    const h = await createDashboardHarness();
    h.state.cooldown = true;
    const cookie = await h.login();
    const res = await h.call("/api/session/start", { ...h.json({}), cookie });
    assert.equal(res.status, 429);
    assert.match(((await res.json()) as { error: string }).error, /đợi 12 giây/);
  });
});
