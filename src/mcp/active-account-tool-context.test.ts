import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeAccountRegistry, type AccountRegistry } from "../accounts/zalo-account-registry.js";
import { parseEnv } from "../config/env-schema.js";
import { getMeta, setMeta } from "../storage/thread-directory-store.js";
import { createActiveAccountToolContext } from "./active-account-tool-context.js";

const nick = (id: string, readOnly = false) => ({ id, uid: null, displayName: null, avatarUrl: null, addedAt: "x", lastActiveAt: null, readOnly });

describe("ngữ cảnh tool MCP theo nick đang dùng", () => {
  it("chưa có nick: báo cần đăng nhập trên dashboard; đổi nick trên dashboard thì tool theo ngay", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zam-mcp-ctx-"));
    const ctx = createActiveAccountToolContext(parseEnv({ DATA_DIR: dataDir }), dataDir);
    assert.throws(() => ctx.db, /đăng nhập Zalo bằng QR/);

    const registry: AccountRegistry = { activeAccountId: "nick-phu", accounts: [nick("nick-phu"), nick("nick-chinh")] };
    writeAccountRegistry(dataDir, registry);
    assert.equal(ctx.accountId, "nick-phu");
    setMeta(ctx.db, "danh_dau", "phu");
    assert.match(ctx.mediaRoot, /nick-phu[\\/]media$/);

    assert.equal(ctx.readOnly, false);
    writeAccountRegistry(dataDir, { activeAccountId: "nick-chinh", accounts: [nick("nick-phu"), nick("nick-chinh", true)] });
    assert.equal(ctx.accountId, "nick-chinh");
    assert.equal(ctx.readOnly, true, "nick mượn / nick mới chỉ đọc: tool gửi biết ngay");
    assert.equal(getMeta(ctx.db, "danh_dau"), null, "DB của nick khác");
    ctx.close();
  });
});
