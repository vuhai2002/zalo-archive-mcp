import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { UpdateInfo } from "../shared/github-release-update-check.js";
import { createDashboardHarness } from "./dashboard-test-harness.js";

const info = (over: Partial<UpdateInfo>): UpdateInfo => ({
  enabled: true,
  current: "0.4.0",
  latest: null,
  updateAvailable: false,
  releaseUrl: null,
  notes: null,
  checkedAt: null,
  ...over,
});

describe("GET /api/version: báo có bản mới cho dashboard", () => {
  it("cần đăng nhập; trả kết quả kiểm tra bản mới", async () => {
    const latest = info({ latest: "0.5.0", updateAvailable: true, releaseUrl: "https://github.com/nguoi-mau/kho-mau/releases/tag/v0.5.0" });
    const h = await createDashboardHarness({ updates: { check: async () => latest, peek: () => latest } });
    assert.equal((await h.call("/api/version")).status, 401);
    const cookie = await h.login();
    assert.deepEqual(await (await h.call("/api/version", { cookie })).json(), latest);
  });

  it("POST /api/version/check: hỏi lại ngay (force); GET /api/about: thông tin giới thiệu", async () => {
    const forced: boolean[] = [];
    const latest = info({ latest: "0.5.0", updateAvailable: true });
    const about = { version: "0.4.0", authorName: "Tác Giả Thử Nghiệm", authorUrl: "https://example.com/nguoi-mau", repoUrl: "https://example.com/kho-mau" };
    const h = await createDashboardHarness({
      updates: { check: async (o) => (forced.push(!!o?.force), latest), peek: () => latest },
      about,
    });
    const cookie = await h.login();
    const res = await h.call("/api/version/check", { ...h.json({}), cookie });
    assert.deepEqual([res.status, ((await res.json()) as typeof latest).latest, forced], [200, "0.5.0", [true]]);
    assert.deepEqual(await (await h.call("/api/about", { cookie })).json(), about);
  });

  it("không có bộ kiểm tra (hay kiểm tra hỏng) thì vẫn trả bản đang chạy, không báo bản mới", async () => {
    const h = await createDashboardHarness();
    const cookie = await h.login();
    const body = (await (await h.call("/api/version", { cookie })).json()) as UpdateInfo;
    assert.deepEqual([body.current, body.updateAvailable, body.enabled], ["0.0.0", false, false]);
  });
});
