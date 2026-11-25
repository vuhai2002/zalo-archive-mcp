// MCP server của kho qua stdio, để Claude Code / Claude Desktop trên cùng máy gọi.
// stdout là kênh giao thức: MỌI log phải ra stderr (logger đã làm vậy).
// Không cần khóa mã hóa: server này không đăng nhập Zalo, chỉ đọc kho và xếp tin vào hàng đợi.
// Luôn theo nick đang dùng trên dashboard (đổi nick không cần khởi động lại MCP).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveDataDir } from "../config/account-paths.js";
import { appVersion, createAppUpdateChecker } from "../config/app-version-and-update-checker.js";
import { getEnv } from "../config/env.js";
import { createActiveAccountToolContext } from "../mcp/active-account-tool-context.js";
import { createArchiveMcpServer } from "../mcp/create-archive-mcp-server.js";
import { createLogger } from "../shared/logger.js";

const env = getEnv();
const log = createLogger({ name: "mcp", level: env.LOG_LEVEL });
const ctx = createActiveAccountToolContext(env, resolveDataDir(env));

const updates = createAppUpdateChecker(env);
// Hỏi GitHub một lần ở nền ngay khi chạy, để sync_status sớm biết có bản mới (lỗi mạng thì bỏ qua)
void updates.check().catch(() => undefined);
const server = createArchiveMcpServer(ctx, { version: appVersion(), updates });
await server.connect(new StdioServerTransport());
log.info("MCP server kho Zalo đã sẵn sàng (stdio)");

const shutdown = () => {
  void server.close().finally(() => {
    ctx.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
