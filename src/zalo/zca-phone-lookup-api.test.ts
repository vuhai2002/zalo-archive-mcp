import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZaloApiError, type API } from "zca-js";
import { installPhoneLookupApi } from "./zca-phone-lookup-api.js";

/** zca-js giả: `api.custom` gắn hàm như thật, `utils` ghi lại chuỗi được mã hóa + URL, `resolve` trả theo kịch bản */
function fakeApi(resolve: () => Promise<unknown>, request?: () => Promise<Response>) {
  const seen = { encoded: "", url: "" };
  const ctx = { imei: "imei-test", language: "vi", loginInfo: {} };
  const utils = {
    encodeAES: (s: string) => {
      seen.encoded = s;
      return "enc";
    },
    makeURL: (base: string, params: Record<string, unknown> = {}) => {
      const u = new URL(base);
      for (const [k, v] of Object.entries(params)) u.searchParams.append(k, String(v));
      return u.toString();
    },
    request: async (url: string) => {
      seen.url = url;
      return request ? request() : new Response("{}");
    },
    resolve,
  };
  const api: Record<string, unknown> = { zpwServiceMap: { friend: ["https://friend.example.com"] } };
  api.custom = (name: string, fn: (args: unknown) => Promise<unknown>) =>
    Object.defineProperty(api, name, { value: (props: unknown) => fn({ ctx, utils, props }) });
  return { api: api as unknown as API, seen };
}

describe("installPhoneLookupApi", () => {
  it("gọi profile/get với reqSrc 85 và số 84...", async () => {
    const { api, seen } = fakeApi(async () => ({ uid: "1000000000000000001", zalo_name: "Lan", display_name: "Lan", avatar: "https://f1.zdn.vn/a.jpg" }));
    const r = await installPhoneLookupApi(api)("84900000001");
    assert.match(seen.url, /^https:\/\/friend\.example\.com\/api\/friend\/profile\/get\?/);
    assert.equal(new URL(seen.url).searchParams.get("params"), "enc");
    assert.deepEqual(JSON.parse(seen.encoded), { phone: "84900000001", avatar_size: 240, language: "vi", imei: "imei-test", reqSrc: 85 });
    assert.deepEqual(r, { kind: "found", user: { uid: "1000000000000000001", name: "Lan", avatarUrl: "https://f1.zdn.vn/a.jpg" } });
  });

  it("thiếu tên hiển thị thì dùng tên Zalo", async () => {
    const { api } = fakeApi(async () => ({ uid: "1000000000000000001", zalo_name: "Minh", display_name: "", avatar: "" }));
    assert.deepEqual(await installPhoneLookupApi(api)("84900000001"), { kind: "found", user: { uid: "1000000000000000001", name: "Minh", avatarUrl: null } });
  });

  it("ZaloApiError 216 thành zalo_error", async () => {
    const { api } = fakeApi(async () => {
      throw new ZaloApiError("User không hợp lệ", 216);
    });
    assert.deepEqual(await installPhoneLookupApi(api)("84900000001"), { kind: "zalo_error", code: 216, message: "User không hợp lệ" });
  });

  it("Zalo trả thiếu uid thì là zalo_error không mã", async () => {
    const { api } = fakeApi(async () => ({ zalo_name: "Lan" }));
    const r = await installPhoneLookupApi(api)("84900000001");
    assert.equal(r.kind, "zalo_error");
    assert.equal(r.kind === "zalo_error" ? r.code : 0, null);
  });

  it("lỗi mạng ném ra ngoài", async () => {
    const { api } = fakeApi(
      async () => ({}),
      async () => {
        throw new TypeError("fetch failed");
      },
    );
    await assert.rejects(installPhoneLookupApi(api)("84900000001"), /fetch failed/);
  });

  it("gắn hai lần trên cùng instance không lỗi", async () => {
    const { api } = fakeApi(async () => ({ uid: "1000000000000000001", zalo_name: "Lan", display_name: "Lan", avatar: "" }));
    installPhoneLookupApi(api);
    assert.equal((await installPhoneLookupApi(api)("84900000001")).kind, "found");
  });
});
