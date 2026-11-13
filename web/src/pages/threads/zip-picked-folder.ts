import { MAX_FILE_BYTES } from "./composer-attachment-rules";
import { buildStoreZip } from "./zip-store-files";

/**
 * Nút Chọn Thư mục: trình duyệt trả mọi file trong thư mục (kèm đường dẫn tương đối `webkitRelativePath`), kho gói lại
 * thành MỘT file "<tên thư mục>.zip" để gửi như file thường. Thư mục trống / quá trần cỡ thì báo lỗi.
 */
export async function zipPickedFolder(files: File[]): Promise<File> {
  if (files.length === 0) throw new Error("Thư mục trống, không có file nào để gửi.");
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_FILE_BYTES) throw new Error(`Thư mục quá lớn (tối đa ${MAX_FILE_BYTES / 1048576} MB).`);
  const pathOf = (f: File) => f.webkitRelativePath || f.name;
  const root = pathOf(files[0]!).split("/")[0] || "thu-muc";
  const entries = await Promise.all(
    files.map(async (f) => ({ name: pathOf(f), data: new Uint8Array(await f.arrayBuffer()), modified: new Date(f.lastModified) })),
  );
  return new File([buildStoreZip(entries)], `${root}.zip`, { type: "application/zip" });
}
