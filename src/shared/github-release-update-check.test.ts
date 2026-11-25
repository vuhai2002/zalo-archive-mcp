import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareVersions, createUpdateChecker, githubRepoOf } from "./github-release-update-check.js";

const REPO = { owner: "nguoi-mau", repo: "kho-mau" };
const okFetch = (body: unknown, calls: string[] = []) =>
  (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

describe("kiểm tra bản mới trên GitHub Release", () => {
  it("so phiên bản theo số, không theo chữ; bỏ tiền tố v", () => {
    assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
    assert.equal(compareVersions("v1.2.0", "1.2"), 0);
    assert.equal(compareVersions("1.2.3", "1.3.0"), -1);
    assert.equal(compareVersions("1.0.0-beta", "1.0.0"), 0, "phần sau dấu - không tính");
  });

  it("đọc owner/repo từ trường repository của package.json", () => {
    assert.deepEqual(githubRepoOf("github:nguoi-mau/kho-mau"), REPO);
    assert.deepEqual(githubRepoOf({ url: "git+https://github.com/nguoi-mau/kho-mau.git" }), REPO);
    assert.equal(githubRepoOf("https://example.com/khac"), null);
    assert.equal(githubRepoOf(undefined), null);
  });

  it("có bản mới hơn: báo bản mới, link release TỰ DỰNG, ghi chú cắt ngắn; hỏi lại trong nhịp thì dùng cache", async () => {
    const calls: string[] = [];
    let now = 1_000;
    const check = createUpdateChecker({
      currentVersion: "0.4.0",
      repo: REPO,
      intervalMs: 60_000,
      now: () => now,
      fetchFn: okFetch({ tag_name: "v0.5.0", html_url: "https://example.com/lua", body: "x".repeat(5000) }, calls),
    });
    const r = await check.check();
    assert.equal(r.updateAvailable, true);
    assert.equal(r.latest, "0.5.0");
    assert.equal(r.releaseUrl, "https://github.com/nguoi-mau/kho-mau/releases/tag/v0.5.0");
    assert.ok(r.notes!.length <= 2003 && r.notes!.endsWith("..."));
    await check.check();
    assert.equal(calls.length, 1, "trong nhịp không hỏi lại");
    assert.equal(check.peek()?.latest, "0.5.0");
    now += 60_001;
    await check.check();
    assert.equal(calls.length, 2, "hết nhịp thì hỏi lại");
  });

  it("đang chạy bản bằng hoặc mới hơn: không báo", async () => {
    const check = createUpdateChecker({ currentVersion: "0.5.0", repo: REPO, intervalMs: 60_000, fetchFn: okFetch({ tag_name: "v0.5.0" }) });
    const r = await check.check();
    assert.deepEqual([r.updateAvailable, r.latest], [false, "0.5.0"]);
  });

  it("mạng lỗi, GitHub trả lỗi, không có repo hay đã tắt: không báo, không ném", async () => {
    const boom = (async () => {
      throw new Error("mất mạng");
    }) as typeof fetch;
    const fail = (async () => new Response("{}", { status: 403 })) as typeof fetch;
    for (const opts of [{ fetchFn: boom }, { fetchFn: fail }, { fetchFn: okFetch({ tag_name: "v9.0.0" }), repo: null }]) {
      const r = await createUpdateChecker({ currentVersion: "0.4.0", repo: REPO, intervalMs: 60_000, ...opts }).check();
      assert.deepEqual([r.updateAvailable, r.latest], [false, null]);
    }
    const off = await createUpdateChecker({ currentVersion: "0.4.0", repo: REPO, intervalMs: 60_000, enabled: false, fetchFn: okFetch({ tag_name: "v9.0.0" }) }).check();
    assert.deepEqual([off.enabled, off.updateAvailable], [false, false]);
  });
});
