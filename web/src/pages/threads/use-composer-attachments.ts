import { useCallback, useEffect, useRef, useState } from "react";
import type { SendRequest } from "../../archive-api-types";
import { api } from "../../dashboard-api-client";
import { pasteProblem, sendAsForPasted, type SendAs } from "./composer-attachment-rules";

/** Một file trong khay chờ gửi (dán / kéo thả vào ô soạn): ảnh có ảnh xem trước */
export type PendingAttachment = { key: string; file: File; as: SendAs; previewUrl: string | null };

/**
 * Khay file dán / kéo thả vào ô soạn, như Zalo: file nằm chờ phía trên ô nhập, bấm Enter / nút gửi mới gửi (ảnh thành chùm,
 * file khác thành thẻ file, chữ đi sau cùng). Ảnh xem trước dùng URL tạm của trình duyệt, bỏ file / gửi xong thì thu hồi.
 */
export function useComposerAttachments(onProblem: (message: string) => void) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const seq = useRef(0);

  useEffect(() => () => itemsRef.current.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl)), []);

  const add = useCallback(
    (files: File[]) => {
      const problem = pasteProblem(files, itemsRef.current.length);
      if (problem) return onProblem(problem);
      const added = files.map((file) => {
        const as = sendAsForPasted(file.name);
        return { key: `a${++seq.current}`, file, as, previewUrl: as === "photo" ? URL.createObjectURL(file) : null };
      });
      setItems((cur) => [...cur, ...added]);
    },
    [onProblem],
  );

  const remove = useCallback((key: string) => {
    setItems((cur) => {
      const gone = cur.find((i) => i.key === key);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return cur.filter((i) => i.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    itemsRef.current.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
    setItems([]);
  }, []);

  return { items, add, remove, clear };
}

/** Tải lần lượt từng file lên máy chủ (file lớn không tranh băng thông nhau); báo tiến độ "2/5" */
export async function uploadAll(entries: Array<{ file: File; as: SendAs }>, onProgress: (text: string) => void): Promise<NonNullable<SendRequest["uploads"]>> {
  const uploads: NonNullable<SendRequest["uploads"]> = [];
  for (const [i, e] of entries.entries()) {
    onProgress(entries.length > 1 ? `Đang tải lên ${i + 1}/${entries.length}...` : "Đang tải lên...");
    const up = await api.outboxUpload(e.file);
    uploads.push({ id: up.uploadId, as: e.as });
  }
  return uploads;
}
