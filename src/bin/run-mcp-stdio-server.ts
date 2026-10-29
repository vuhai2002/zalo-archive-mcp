// MCP server của kho qua stdio, để Claude Code / Claude Desktop trên cùng máy gọi.
// stdout là kênh giao thức: MỌI log phải ra stderr (logger đã làm vậy).
// Không cần CREDENTIALS_ENCRYPTION_KEY: server này không đăng nhập Zalo, chỉ đọc kho và ghi nháp.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { accountPaths } from "../config/account-paths.js";
import { getEnv } from "../config/env.js";
import { createArchiveMcpServer } from "../mcp/create-archive-mcp-server.js";
import { createLogger } from "../shared/logger.js";
import { openArchiveDatabase } from "../storage/open-archive-database.js";

const env = getEnv();
const paths = accountPaths(env);
const log = createLogger({ name: "mcp", level: env.LOG_LEVEL });
const db = openArchiveDatabase(paths.databaseFile);

const server = createArchiveMcpServer({ db, env, mediaRoot: paths.mediaDir });
await server.connect(new StdioServerTransport());
log.info({ account: env.ZALO_ACCOUNT_ID }, "MCP server kho Zalo đã sẵn sàng (stdio)");

const shutdown = () => {
  void server.close().finally(() => {
    db.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
