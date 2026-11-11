import { useMemo } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { usePresentationMode } from "../../layout/presentation-mode-context";
import { IconChat, IconPresentation } from "../../shared/dashboard-icons";
import { PresentationThreadListPanel } from "./presentation-thread-list-panel";
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
 *
 * `?msg=<id tin>`: mở hội thoại tại đúng tin đó (bấm kết quả tìm chung). Mỗi lần bấm là một lần điều
 * hướng mới (`location.key` đổi), nên bấm lại đúng kết quả cũ vẫn nhảy lại tới tin.
 *
 * Đang trình chiếu: cột trái chỉ còn các hội thoại chọn sẵn; mở một hội thoại khác (lịch sử trình duyệt, link) thì khung tin
 * chỉ báo đang ẩn, không hiện tin.
 */
export function ThreadsPage() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const msg = Number(params.get("msg"));
  const focus = useMemo(
    () => (threadId && Number.isSafeInteger(msg) && msg > 0 ? { messageId: msg, key: location.key } : null),
    [threadId, msg, location.key],
  );
  const path = (id: string) => `/threads/${encodeURIComponent(id)}`;
  // Bấm icon Hội thoại ở thanh bên: mỗi lần bấm là một lần điều hướng mới (key đổi) - danh sách về đầu, thoát tìm kiếm.
  // Nút quay lại từ khung tin (màn hẹp) thì KHÔNG đặt cờ này: danh sách giữ nguyên ô tìm + chỗ đang cuộn
  const resetKey = (location.state as { resetThreadList?: boolean } | null)?.resetThreadList ? location.key : null;
  const presentation = usePresentationMode();

  return (
    <div className="flex h-[calc(100dvh-109px)] min-h-[420px] lg:h-screen">
      <div className={`${threadId ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-line lg:w-80 lg:border-r xl:w-[360px]`}>
        {presentation.active ? (
          <PresentationThreadListPanel selectedId={threadId} onSelect={(id) => navigate(path(id))} />
        ) : (
          <ThreadListPanel
            selectedId={threadId}
            resetKey={resetKey}
            onSelect={(id) => navigate(path(id))}
            onOpenMessage={(id, messageId) => navigate(`${path(id)}?msg=${messageId}`)}
          />
        )}
      </div>

      <div className={`${threadId ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col`}>
        {threadId && !presentation.isShown(threadId) ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-chat p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <IconPresentation size={26} />
            </span>
            <p className="text-[14px] text-ink-soft">Hội thoại này đang ẩn vì đang trình chiếu.</p>
          </div>
        ) : threadId ? (
          <ThreadMessagePane key={threadId} threadId={threadId} focus={focus} onBack={() => navigate("/threads")} />
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
