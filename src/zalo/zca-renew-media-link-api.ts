import type { API } from "zca-js";

export type RenewMediaLinkInput = {
  threadId: string;
  isGroup: boolean;
  /** Loại media của renewlink: 1 file, 2 ảnh, 5 video (`renewableMediaType`) */
  mediaType: number;
  /** Thông tin media dựng từ tin gốc (`renewMsgInfoFromRawJson`) */
  msgInfo: Record<string, string | number>;
};

type CustomApiArgs = {
  ctx: { imei: string; loginInfo?: { zpw_service_map_v3?: Record<string, string[]> } };
  utils: {
    encodeAES: (data: string) => string | null;
    makeURL: (base: string, params?: Record<string, unknown>) => string;
    request: (url: string, init: RequestInit) => Promise<Response>;
    resolve: (response: Response) => Promise<unknown>;
  };
  props: RenewMediaLinkInput;
};

/**
 * Gắn lời gọi `renewlink` (cmd 12094) vào instance zca-js qua điểm mở rộng `api.custom`:
 * POST {file service}/api/message/renewlink, `params` mã hóa như mọi lời gọi zca-js, tham số
 * như Zalo Web (clientId là mã mới cho mỗi lần xin). Trả phần `data` đã giải mã.
 */
export function installRenewMediaLinkApi(api: API): (input: RenewMediaLinkInput) => Promise<unknown> {
  const a = api as unknown as Record<string, unknown> & {
    custom: (name: string, fn: (args: CustomApiArgs) => Promise<unknown>) => void;
    zpwServiceMap?: Record<string, string[]>;
  };
  // `api.custom` tạo property không ghi đè được: mỗi instance chỉ gắn một lần
  if (typeof a.renewMediaLink !== "function") {
    a.custom("renewMediaLink", async ({ ctx, utils, props }) => {
      const fileDomain = a.zpwServiceMap?.file?.[0] ?? ctx.loginInfo?.zpw_service_map_v3?.file?.[0];
      if (!fileDomain) throw new Error("Thiếu file service domain");
      const params = {
        toId: props.threadId,
        msgType: props.mediaType,
        msgInfo: JSON.stringify({ ...props.msgInfo, isE2EE: 0, isOriginal: 0 }),
        clientId: String(Date.now()),
        imei: ctx.imei,
        isGroup: props.isGroup ? 1 : 0,
      };
      const encrypted = utils.encodeAES(JSON.stringify(params));
      if (!encrypted) throw new Error("Không mã hóa được params renewlink");
      const response = await utils.request(utils.makeURL(`${fileDomain}/api/message/renewlink`), {
        method: "POST",
        body: new URLSearchParams({ params: encrypted }),
      });
      return utils.resolve(response);
    });
  }
  const call = a.renewMediaLink as (input: RenewMediaLinkInput) => Promise<unknown>;
  return (input) => call(input);
}
