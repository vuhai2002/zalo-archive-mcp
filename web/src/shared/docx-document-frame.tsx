import { useEffect, useRef, useState } from "react";
import { safeDocxLinkHref } from "./docx-file-rules";

/**
 * Khung đọc file Word (.docx) ngay trong kho, thay cho việc tải về rồi mở Word: thư viện `docx-preview` (chỉ tải khi mở
 * file docx đầu tiên) dựng từng trang như Word - chữ, bảng, ảnh, đầu / chân trang - trên nền xám.
 *
 * File do người khác gửi nên dựng trong iframe `sandbox` KHÔNG có allow-scripts: không đoạn mã nào trong nội dung chạy
 * được. Dashboard vẫn ghi vào được nhờ allow-same-origin (chỉ nguy hiểm khi đi cùng allow-scripts). Sau khi dựng, link
 * ngoài chỉ giữ http / https / mailto và mở tab mới; link nội bộ (#mục) cuộn trong file. Ảnh nhúng dạng data: (không để
 * lại blob URL sau khi đóng); HTML nhúng trong file (altChunk) không dựng. Esc khi đang bấm trong file gọi `onEscape`.
 */
export function DocxDocumentFrame({ url, onEscape }: { url: string; onEscape?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    const doc = frameReady ? frame.current?.contentDocument : null;
    const body = doc?.getElementById("docx-body");
    const styles = doc?.getElementById("docx-styles");
    if (!doc || !body || !styles) return;
    let cancelled = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") escape.current?.();
    };
    doc.addEventListener("keydown", onKey);
    setState("loading");
    (async () => {
      try {
        const [{ renderAsync }, blob] = await Promise.all([
          import("docx-preview"),
          fetch(url).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.blob();
          }),
        ]);
        if (cancelled) return;
        await renderAsync(blob, body, styles, { className: "docx", useBase64URL: true, renderAltChunks: false });
        if (cancelled) return;
        neutralizeLinks(doc);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      doc.removeEventListener("keydown", onKey);
    };
  }, [frameReady, url]);

  return (
    <div className="relative h-full w-full bg-[#e9eaed]">
      <iframe
        ref={frame}
        title="Nội dung file Word"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={FRAME_HTML}
        onLoad={() => setFrameReady(true)}
        className={`block h-full w-full border-0 ${state === "ready" ? "" : "invisible"}`}
      />
      {state !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[14px] text-[#4a5361]">
          {state === "loading" ? "Đang mở file Word..." : "Không đọc được file này trong kho (file hỏng hoặc không phải Word đời mới). Hãy tải về để mở bằng Word."}
        </div>
      )}
    </div>
  );
}

/** Link trong file: bookmark (#mục) giữ để cuộn trong file; link ngoài an toàn mở tab mới; còn lại gỡ hẳn href */
function neutralizeLinks(doc: Document) {
  for (const a of doc.querySelectorAll("a")) {
    const raw = a.getAttribute("href") ?? "";
    if (/^#./.test(raw)) continue;
    const safe = safeDocxLinkHref(raw);
    if (safe) {
      a.setAttribute("href", safe);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    } else {
      a.removeAttribute("href");
    }
  }
}

// Nền xám nhạt như Word, trang trắng bóng nhẹ; `safe center`: trang rộng hơn khung thì cuộn ngang được cả mép trái
const FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#e9eaed}
.docx-wrapper{background:#e9eaed !important;padding:24px 16px 1px !important;align-items:safe center !important}
.docx-wrapper>section.docx{box-shadow:0 1px 4px rgba(0,0,0,.18) !important;margin-bottom:24px !important}
a[href]{cursor:pointer}
</style></head><body><div id="docx-styles" hidden></div><div id="docx-body"></div></body></html>`;
