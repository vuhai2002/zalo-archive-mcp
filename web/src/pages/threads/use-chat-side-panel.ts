import { useCallback, useRef, useState } from "react";

export type ChatSidePanel = "info" | "search" | null;

const INFO_PANEL_KEY = "zalo-archive.thread-info-open";

/** Bảng thông tin có đang được mở không (nhớ theo trình duyệt; hỏng thì mặc định đóng) */
function readInfoOpen(): boolean {
  try {
    return localStorage.getItem(INFO_PANEL_KEY) === "1" && window.matchMedia("(min-width: 1280px)").matches;
  } catch {
    return false;
  }
}

function saveInfoOpen(open: boolean): void {
  try {
    localStorage.setItem(INFO_PANEL_KEY, open ? "1" : "0");
  } catch {
    // Trình duyệt chặn lưu: vẫn bật/tắt được trong lần mở này
  }
}

/**
 * Cột bên phải khung chat, như Zalo PC: bảng "Thông tin hội thoại" hoặc bảng "Tìm kiếm trong trò
 * chuyện" (mở bảng tìm thì nó thế chỗ bảng thông tin, đóng lại thì bảng thông tin quay về nếu trước
 * đó đang mở). Bảng thông tin mở hay đóng được nhớ, chỉ tự mở lại trên màn rộng (xl), nơi bảng là một
 * cột riêng; màn hẹp bảng phủ lên khung chat.
 */
export function useChatSidePanel() {
  const [panel, setPanel] = useState<ChatSidePanel>(() => (readInfoOpen() ? "info" : null));
  const infoBeforeSearch = useRef(false);

  const toggleInfo = useCallback(() => {
    setPanel((p) => {
      const open = p !== "info";
      saveInfoOpen(open);
      return open ? "info" : null;
    });
  }, []);

  const toggleSearch = useCallback(() => {
    setPanel((p) => {
      if (p === "search") return infoBeforeSearch.current ? "info" : null;
      infoBeforeSearch.current = p === "info";
      return "search";
    });
  }, []);

  const closeSearch = useCallback(() => setPanel(infoBeforeSearch.current ? "info" : null), []);

  return { panel, toggleInfo, toggleSearch, closeSearch };
}
