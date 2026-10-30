import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ViewerItem } from "./media-viewer-items";
import { MediaViewer } from "./media-viewer";

type MediaViewerApi = { open: (item: ViewerItem) => void };

const MediaViewerContext = createContext<MediaViewerApi | null>(null);

/**
 * Mở cửa sổ xem ảnh / video của hội thoại đang mở. null khi nằm ngoài khung chat - khi đó ảnh vẫn mở
 * ở thẻ mới như trước.
 */
export function useMediaViewer(): MediaViewerApi | null {
  return useContext(MediaViewerContext);
}

/** Bọc khung chat của một hội thoại: ảnh, video, ô album, ô trong bảng thông tin đều mở cùng một cửa sổ xem */
export function MediaViewerProvider({
  threadId,
  threadName,
  timeZone,
  onOpenMessage,
  children,
}: {
  threadId: string;
  threadName: string;
  timeZone: string;
  onOpenMessage: (messageId: number) => void;
  children: ReactNode;
}) {
  const [start, setStart] = useState<ViewerItem | null>(null);
  const api = useMemo(() => ({ open: setStart }), []);
  return (
    <MediaViewerContext.Provider value={api}>
      {children}
      {start && (
        <MediaViewer
          key={start.id}
          threadId={threadId}
          threadName={threadName}
          start={start}
          timeZone={timeZone}
          onClose={() => setStart(null)}
          onOpenMessage={(id) => {
            setStart(null);
            onOpenMessage(id);
          }}
        />
      )}
    </MediaViewerContext.Provider>
  );
}
