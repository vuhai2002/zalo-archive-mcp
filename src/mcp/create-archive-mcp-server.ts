import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAttachmentTool, listThreadsTool, readThreadTool, type ReadToolContext } from "./archive-read-tool-handlers.js";
import { searchMessagesTool } from "./search-messages-tool.js";
import type { UpdateChecker } from "../shared/github-release-update-check.js";
import { syncStatusTool } from "./archive-sync-status-tool.js";
import { listGroupMembersTool } from "./group-members-tool.js";
import { registerSendTools } from "./register-send-tools.js";
import { safeToolHandler } from "./tool-result.js";
import { unrepliedThreadsTool } from "./unreplied-threads-tool.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Ngày YYYY-MM-DD theo giờ của kho");

/**
 * MCP server của kho: nhóm ĐỌC (ở đây) + nhóm GỬI (`register-send-tools.ts`).
 * Không có tool nào chạm kill switch hay cài đặt gửi - việc đó chỉ người dùng
 * làm trên dashboard.
 */
export function createArchiveMcpServer(
  ctx: ReadToolContext & { readonly readOnly: boolean; readonly outboxFilesDir?: string },
  opts: { version?: string; updates?: UpdateChecker } = {},
): McpServer {
  const server = new McpServer({ name: "zalo-archive", version: opts.version ?? "0.0.0" });

  server.registerTool(
    "list_threads",
    {
      description:
        "Liệt kê hội thoại Zalo trong kho (mới nhất trước). Lọc theo tên (không phân biệt dấu) hoặc đúng thread_id. " +
        "unreplied_only=true: chỉ hội thoại ĐANG CHỜ người dùng trả lời (câu 'có tin nào tôi chưa rep') - 1-1 có tin cuối của " +
        "người kia, nhóm có tin nhắc tên / trả lời người dùng mà họ chưa đáp; kèm số tin chờ và đầu tin. Xét tin từ from_date " +
        "(mặc định 14 ngày qua).",
      inputSchema: {
        query: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        unreplied_only: z.boolean().optional(),
        from_date: dateField.optional().describe("Chỉ dùng với unreplied_only: xét tin từ ngày này (YYYY-MM-DD, giờ của kho)"),
      },
      annotations: READ_ONLY,
    },
    safeToolHandler(({ unreplied_only, from_date, ...a }) => (unreplied_only ? unrepliedThreadsTool(ctx, { ...a, from_date }) : listThreadsTool(ctx, a))),
  );

  server.registerTool(
    "read_thread",
    {
      description:
        "Đọc tin của một hội thoại theo thời gian (mặc định trang mới nhất, 50 tin). Mỗi tin có số #N (dùng cho reply_to, " +
        "react_to_message, around_id). Dùng MỘT trong: before_id (tin cũ hơn), after_id (tin mới hơn), around_id (đoạn quanh một " +
        "tin, vd tin vừa tìm ra). Cuối kết quả ghi hội thoại có tổng bao nhiêu tin và còn bao nhiêu tin cũ / mới hơn: cần đủ thì " +
        "đọc tiếp tới khi hết, đừng kết luận chỉ từ trang đầu. Lọc tin theo người gửi / từ khóa thì dùng search_messages.",
      inputSchema: {
        thread_id: z.string().min(1).max(64),
        before_id: z.number().int().positive().optional(),
        after_id: z.number().int().positive().optional(),
        around_id: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: READ_ONLY,
    },
    safeToolHandler((a) => readThreadTool(ctx, a)),
  );

  server.registerTool(
    "search_messages",
    {
      description:
        "Tìm tin trên TOÀN KHO (mọi nhóm, mọi hội thoại) hoặc một hội thoại (thread_id): theo từ khóa (không phân biệt dấu, mọi " +
        "từ phải có; email, link, số điện thoại, ngày 13/10 thì các phần phải liền nhau), người gửi, khoảng ngày, chỉ tin có file " +
        "(files_only - tìm theo tên file). Người gửi dùng MỘT trong: sender_id (số trong ngoặc sau tên ở read_thread), " +
        "sender_name (tên, không dấu, khớp một phần - trùng nhiều người thì tool liệt kê để chọn sender_id), from_me (tin của " +
        "chính người dùng). Không cần từ khóa: chỉ người gửi hoặc ngày là lấy được mọi tin của người đó. Kết quả mới nhất trước, " +
        "mỗi trang limit tin (mặc định 20); dòng đầu ghi TỔNG số tin khớp, cuối ghi offset để lấy trang tiếp - cần đủ thì lấy " +
        "tiếp tới khi 'Đã hết kết quả', đừng coi trang đầu là tất cả.",
      inputSchema: {
        query: z.string().min(1).max(200).optional(),
        thread_id: z.string().max(64).optional(),
        sender_id: z.string().regex(/^[\w-]+$/).max(64).optional(),
        sender_name: z.string().min(1).max(100).optional(),
        from_me: z.boolean().optional(),
        files_only: z.boolean().optional(),
        from_date: dateField.optional(),
        to_date: dateField.optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(100_000).optional().describe("Bỏ qua chừng này tin đầu (lấy trang tiếp theo)"),
      },
      annotations: READ_ONLY,
    },
    safeToolHandler((a) => searchMessagesTool(ctx, a)),
  );

  server.registerTool(
    "list_group_members",
    {
      description:
        "Thành viên một NHÓM (tên + user_id), lọc theo tên không dấu - để nhắc tên (@) người chưa nhắn trong nhóm, hay xem ai trong nhóm.",
      inputSchema: {
        thread_id: z.string().min(1).max(64),
        query: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: READ_ONLY,
    },
    safeToolHandler((a) => listGroupMembersTool(ctx, a)),
  );

  server.registerTool(
    "get_attachment",
    {
      description: "Thông tin một file đính kèm (ảnh/file/video/voice) và đường dẫn file đã tải trên máy.",
      inputSchema: { attachment_id: z.number().int().positive() },
      annotations: READ_ONLY,
    },
    safeToolHandler((a) => getAttachmentTool(ctx, a)),
  );

  server.registerTool(
    "sync_status",
    {
      description:
        "Kho phủ tới đâu: số tin, các khoảng listener KHÔNG nghe, mỗi khoảng ghi Zalo đã gửi bù đủ hay có thể thiếu tin, media, trạng thái gửi. Gọi trước khi khẳng định 'không có tin'; chỉ báo 'có thể thiếu' cho khoảng được ghi là có thể thiếu hoặc chưa rõ.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    safeToolHandler(() => {
      // Không chờ mạng: dùng kết quả đã có, hỏi lại GitHub ở nền (có cache) cho lần gọi sau
      void opts.updates?.check().catch(() => undefined);
      return syncStatusTool(ctx, opts.updates?.peek() ?? null);
    }),
  );

  // Truyền nguyên ngữ cảnh (không chép `db` ra): bản chạy thật đọc nick đang dùng mỗi lần gọi
  registerSendTools(server, ctx);
  return server;
}
