/**
 * Kết quả của một tool MCP. Tool KHÔNG ném lỗi ra ngoài: mọi nhánh hỏng trả
 * `{ ok: false, error }` bằng câu tiếng Việt cho model tự xử lý, và tầng MCP
 * đánh `isError` theo HÌNH DẠNG chứ không dò chữ.
 */
export type ToolResult = { ok: true; text: string } | { ok: false; error: string };

export const toolOk = (text: string): ToolResult => ({ ok: true, text });
export const toolError = (error: string): ToolResult => ({ ok: false, error });

type CallToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export function toCallToolResult(result: ToolResult): CallToolResult {
  return result.ok
    ? { content: [{ type: "text", text: result.text }] }
    : { content: [{ type: "text", text: result.error }], isError: true };
}

/** Bọc handler (đồng bộ hoặc async): lỗi bất ngờ cũng thành kết quả lỗi, không làm sập phiên MCP */
export function safeToolHandler<A>(handler: (args: A) => ToolResult | Promise<ToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return toCallToolResult(await handler(args));
    } catch (err) {
      return toCallToolResult(toolError(`Lỗi nội bộ: ${err instanceof Error ? err.message : String(err)}`));
    }
  };
}
