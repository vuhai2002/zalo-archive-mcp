import { ZaloApiError, type API } from "zca-js";
import type { FoundUser } from "../storage/phone-lookup-store.js";

export type PhoneLookupOutcome = { kind: "found"; user: FoundUser } | { kind: "zalo_error"; code: number | null; message: string };

type CustomApiArgs = {
  ctx: { imei: string; language: string; loginInfo?: { zpw_service_map_v3?: Record<string, string[]> } };
  utils: {
    encodeAES: (data: string) => string | null;
    makeURL: (base: string, params?: Record<string, unknown>) => string;
    request: (url: string, init?: RequestInit) => Promise<Response>;
    resolve: (response: Response) => Promise<unknown>;
  };
  props: { phone: string };
};

/** Nguồn tra của ô Tìm kiếm trên Zalo Web (SEARCH_PHONE_GLOBAL); `findUser` của zca-js dùng 40 */
const SEARCH_BOX_REQ_SRC = 85;
const AVATAR_SIZE = 240;

type ProfileData = { uid?: unknown; display_name?: unknown; zalo_name?: unknown; avatar?: unknown };
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Tra một số điện thoại trên Zalo đúng như gõ số vào ô Tìm kiếm của Zalo Web (đo 2026-11-14):
 * GET {friend}/api/friend/profile/get, params mã hóa `{ phone, avatar_size, language, imei, reqSrc: 85 }`. Gắn vào instance
 * zca-js qua `api.custom` như `installRenewMediaLinkApi`.
 * - Zalo trả mã lỗi (216 không có Zalo, mã lạ...): `zalo_error` kèm mã + câu, người gọi tự phân loại.
 * - Lỗi mạng / HTTP (không có mã Zalo): ném ra, người gọi thử lại sau.
 */
export function installPhoneLookupApi(api: API): (phone84: string) => Promise<PhoneLookupOutcome> {
  const a = api as unknown as Record<string, unknown> & {
    custom: (name: string, fn: (args: CustomApiArgs) => Promise<unknown>) => void;
    zpwServiceMap?: Record<string, string[]>;
  };
  // `api.custom` tạo property không ghi đè được: mỗi instance chỉ gắn một lần
  if (typeof a.lookupPhoneLikeSearchBox !== "function") {
    a.custom("lookupPhoneLikeSearchBox", async ({ ctx, utils, props }) => {
      const friendDomain = a.zpwServiceMap?.friend?.[0] ?? ctx.loginInfo?.zpw_service_map_v3?.friend?.[0];
      if (!friendDomain) throw new Error("Thiếu friend service domain");
      const params = { phone: props.phone, avatar_size: AVATAR_SIZE, language: ctx.language, imei: ctx.imei, reqSrc: SEARCH_BOX_REQ_SRC };
      const encrypted = utils.encodeAES(JSON.stringify(params));
      if (!encrypted) throw new Error("Không mã hóa được params tra số");
      const response = await utils.request(utils.makeURL(`${friendDomain}/api/friend/profile/get`, { params: encrypted }));
      return utils.resolve(response);
    });
  }
  const call = a.lookupPhoneLikeSearchBox as (props: { phone: string }) => Promise<unknown>;

  return async (phone84) => {
    let data: ProfileData;
    try {
      data = ((await call({ phone: phone84 })) ?? {}) as ProfileData;
    } catch (err) {
      // ZaloApiError có mã = Zalo trả lời; không mã (HTTP hỏng) thì coi như lỗi mạng
      if (err instanceof ZaloApiError && typeof err.code === "number") return { kind: "zalo_error", code: err.code, message: err.message };
      throw err;
    }
    const uid = text(data.uid);
    if (!uid) return { kind: "zalo_error", code: null, message: "Zalo trả kết quả không có mã người dùng" };
    return { kind: "found", user: { uid, name: text(data.display_name) ?? text(data.zalo_name), avatarUrl: text(data.avatar) } };
  };
}
