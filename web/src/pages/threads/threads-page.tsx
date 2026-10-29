import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { IconChat } from "../../shared/dashboard-icons";
import { ThreadListPanel } from "./thread-list-panel";
import { ThreadMessagePane } from "./thread-message-pane";

/**
 * Trang Hội thoại: danh sách bên trái, tin bên phải. Dưới lg là hai màn riêng
 * (đang mở một hội thoại thì chỉ hiện khung tin, có nút quay lại).
 *
 * Chiều cao = màn hình (từ lg, sát mép như Zalo PC); dưới lg trừ topbar 53px + thanh icon đáy 56px
 * để chỉ khung tin cuộn, không phải cả trang - ô soạn
 * tin luôn nằm ở đáy. Danh sách chỉ ẩn bằng CSS chứ không gỡ khỏi cây: quay
 * lại từ khung tin vẫn còn nguyên ô tìm và các trang đã tải.
 */
export function ThreadsPage() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  // ?find=1: mở từ nút tìm của khung chat - cột trái tìm trong hội thoại đang mở (điện thoại thì hiện cột trái)
  const [params] = useSearchParams();
  const findIn = threadId && params.get("find") === "1" ? threadId : null;

  return (
    <div className="flex h-[calc(100dvh-109px)] min-h-[420px] lg:h-screen">
      <div className={`${threadId && !findIn ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-line lg:w-80 lg:border-r xl:w-[360px]`}>
        <ThreadListPanel
          selectedId={threadId}
          onSelect={(id) => navigate(`/threads/${encodeURIComponent(id)}`)}
          scopeThreadId={findIn}
          onCloseScope={() => threadId && navigate(`/threads/${encodeURIComponent(threadId)}`, { replace: true })}
        />
      </div>

      <div className={`${threadId && !findIn ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col`}>
        {threadId ? (
          <ThreadMessagePane key={threadId} threadId={threadId} onBack={() => navigate("/threads")} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-chat p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zalo-50 text-zalo-500">
              <IconChat size={26} />
            </span>
            <p className="text-[14px] text-ink-soft">Chọn một hội thoại bên trái để xem tin nhắn.</p>
          </div>
        )}
      </div>
    </div>
  );
}
