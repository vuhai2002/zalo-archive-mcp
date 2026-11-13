import { useRef } from "react";
import { PHOTO_ACCEPT, type SendAs } from "./composer-attachment-rules";
import { zipPickedFolder } from "./zip-picked-folder";

/**
 * Ba ô chọn file ẩn của khung soạn: ảnh (nút Gửi hình ảnh - vào chùm ảnh), file (Chọn File - thẻ file, kể cả ảnh), thư mục
 * (Chọn Thư mục - gói thành một file .zip). Chọn xong KHÔNG gửi ngay: file vào khay chờ (`onPicked`) như Zalo, để người dùng
 * còn bỏ / thêm / thay rồi mới bấm gửi.
 */
export function useComposerFilePickers(onPicked: (files: File[], as: SendAs) => void, onError: (message: string) => void) {
  const photo = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  const take = (input: HTMLInputElement, as: SendAs) => {
    const files = [...(input.files ?? [])];
    input.value = "";
    if (files.length > 0) onPicked(files, as);
  };

  async function takeFolder(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    input.value = "";
    try {
      onPicked([await zipPickedFolder(files)], "file");
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  const inputs = (
    <>
      <input ref={photo} type="file" accept={PHOTO_ACCEPT} multiple hidden onChange={(e) => take(e.currentTarget, "photo")} />
      <input ref={file} type="file" multiple hidden onChange={(e) => take(e.currentTarget, "file")} />
      {/* webkitdirectory: chọn cả thư mục (Chrome, Edge, Firefox đều có) */}
      <input ref={folder} type="file" hidden {...{ webkitdirectory: "" }} onChange={(e) => void takeFolder(e.currentTarget)} />
    </>
  );

  return {
    inputs,
    openPhotos: () => photo.current?.click(),
    openFiles: () => file.current?.click(),
    openFolder: () => folder.current?.click(),
  };
}
