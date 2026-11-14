import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { API } from "zca-js";
import type { AppEnv } from "../config/env-schema.js";
import { PhoneLookupWorker } from "../phone-lookup/phone-lookup-loop.js";
import { installPhoneLookupApi } from "../zalo/zca-phone-lookup-api.js";

/** Vòng tra số điện thoại (lookup_phones) nối với zca-js của phiên đang chạy. Trả hàm dừng. */
export function startPhoneLookupLoop(d: {
  api: API;
  db: DatabaseSync;
  env: AppEnv;
  log: Logger;
  isReadOnly: () => boolean;
  isListenerConnected: () => boolean;
}): () => void {
  const worker = new PhoneLookupWorker({
    db: d.db,
    env: d.env,
    log: d.log.child({ part: "phone-lookup" }),
    lookup: installPhoneLookupApi(d.api),
    isReadOnly: d.isReadOnly,
    isListenerConnected: d.isListenerConnected,
  });
  worker.start();
  return () => worker.stop();
}
