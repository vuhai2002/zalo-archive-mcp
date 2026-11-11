import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useConfirmDialog } from "../shared/confirm-dialog";
import {
  EMPTY_PRESENTATION,
  MAX_PRESENTATION_THREADS,
  parsePresentationState,
  PRESENTATION_STORAGE_KEY,
  withThreadAdded,
  type PresentationState,
} from "../shared/presentation-mode-state";

/**
 * Chế độ trình chiếu dùng chung cho thanh bên (nút bật / thoát), trang Hội thoại (danh sách chỉ còn hội thoại chọn sẵn) và
 * hộp Chia sẻ (chỉ chia sẻ tới các hội thoại đó). Nhớ trong localStorage: tải lại trang lúc đang chia sẻ màn hình vẫn đang
 * trình chiếu, không lộ danh sách đầy đủ.
 */
export type PresentationModeValue = {
  active: boolean;
  /** Các hội thoại đang trình chiếu (rỗng khi không trình chiếu: thoát là quên danh sách) */
  threadIds: string[];
  /** Hội thoại này có được hiện không: tắt trình chiếu thì mọi hội thoại đều hiện */
  isShown: (threadId: string) => boolean;
  setupOpen: boolean;
  openSetup: () => void;
  closeSetup: () => void;
  /** Bắt đầu trình chiếu với các hội thoại đã chọn, về trang Hội thoại */
  start: (threadIds: string[]) => void;
  /**
   * Thoát trình chiếu (nút Thoát, nút đỏ ở thanh bên): hỏi lại trước, "Tiếp tục trình chiếu" là nút xanh nổi bật có con trỏ
   * đặt sẵn, "Thoát trình chiếu" chỉ là nút viền - lỡ tay bấm
   * trong lúc chia sẻ màn hình thì danh sách đầy đủ không bung ra ngay. Thoát thì quên luôn danh sách đã chọn.
   */
  requestStop: () => void;
  /** Thêm một hội thoại lúc đang trình chiếu (tìm từ 3 chữ) */
  add: (threadId: string) => void;
};

const PresentationModeContext = createContext<PresentationModeValue | null>(null);

const load = (): PresentationState => {
  try {
    return parsePresentationState(window.localStorage.getItem(PRESENTATION_STORAGE_KEY));
  } catch {
    return EMPTY_PRESENTATION;
  }
};

export function PresentationModeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<PresentationState>(load);
  const [setupOpen, setSetupOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirmDialog();

  useEffect(() => {
    try {
      window.localStorage.setItem(PRESENTATION_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Trình duyệt chặn lưu (cửa sổ ẩn danh...): vẫn trình chiếu được, chỉ không nhớ qua lần tải lại
    }
  }, [state]);

  const start = useCallback(
    (threadIds: string[]) => {
      const ids = [...new Set(threadIds)].slice(0, MAX_PRESENTATION_THREADS);
      if (ids.length === 0) return;
      setState({ active: true, threadIds: ids });
      setSetupOpen(false);
      navigate("/threads", { state: { resetThreadList: true } });
    },
    [navigate],
  );
  const requestStop = useCallback(async () => {
    const ok = await confirm({
      title: "Thoát chế độ trình chiếu?",
      message: "Danh sách sẽ hiện lại mọi hội thoại. Nếu đang chia sẻ màn hình, người xem sẽ thấy hết.",
      confirmLabel: "Thoát trình chiếu",
      cancelLabel: "Tiếp tục trình chiếu",
      preferCancel: true,
    });
    if (ok) setState(EMPTY_PRESENTATION);
  }, [confirm]);
  const add = useCallback((threadId: string) => setState((s) => withThreadAdded(s, threadId)), []);
  const openSetup = useCallback(() => setSetupOpen(true), []);
  const closeSetup = useCallback(() => setSetupOpen(false), []);

  const value = useMemo<PresentationModeValue>(() => {
    const shown = new Set(state.threadIds);
    return {
      active: state.active,
      threadIds: state.threadIds,
      isShown: (threadId) => !state.active || shown.has(threadId),
      setupOpen,
      openSetup,
      closeSetup,
      start,
      requestStop: () => void requestStop(),
      add,
    };
  }, [state, setupOpen, openSetup, closeSetup, start, requestStop, add]);

  return (
    <PresentationModeContext.Provider value={value}>
      {children}
      {confirmDialog}
    </PresentationModeContext.Provider>
  );
}

export function usePresentationMode(): PresentationModeValue {
  const value = useContext(PresentationModeContext);
  if (!value) throw new Error("usePresentationMode phải dùng bên trong PresentationModeProvider");
  return value;
}
