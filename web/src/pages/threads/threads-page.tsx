import { useNavigate, useParams } from "react-router-dom";
import { IconChat } from "../../shared/dashboard-icons";
import { ThreadListPanel } from "./thread-list-panel";
import { ThreadMessagePane } from "./thread-message-pane";

/**
 * Trang Hội thoại: danh sách bên trái, tin bên phải. Dưới lg là hai màn riêng
 * (đang mở một hội thoại thì chỉ hiện khung tin, có nút quay lại).
 *
 * Chiều cao = màn hình trừ đúng phần khung ngoài chiếm (topbar mobile 53px +
 * padding dọc của <main>) để chỉ khung tin cuộn, không phải cả trang - ô soạn
 * tin luôn nằm ở đáy. Danh sách chỉ ẩn bằng CSS chứ không gỡ khỏi cây: quay
 * lại từ khung tin vẫn còn nguyên ô tìm và các trang đã tải.
 */
export function ThreadsPage() {
  const { threadId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="flex h-[calc(100dvh-93px)] min-h-[420px] gap-4 lg:h-[calc(100dvh-56px)]">
      <div className={`${threadId ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col lg:w-80 xl:w-96`}>
        <ThreadListPanel selectedId={threadId} onSelect={(id) => navigate(`/threads/${encodeURIComponent(id)}`)} />
      </div>

      <div className={`${threadId ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col`}>
        {threadId ? (
          <ThreadMessagePane key={threadId} threadId={threadId} onBack={() => navigate("/threads")} />
        ) : (
          <div className="gc-card flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
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
