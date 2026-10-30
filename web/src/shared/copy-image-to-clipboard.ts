/**
 * Chép một ảnh (cùng origin) vào clipboard như nút "Copy" của Zalo. Trình duyệt chỉ nhận PNG, nên ảnh
 * JPEG / WebP được vẽ lại qua canvas thành PNG trước. Ném lỗi nếu trình duyệt không cho ghi clipboard.
 */
export async function copyImageToClipboard(url: string): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") throw new Error("Trình duyệt không cho chép ảnh");
  const blob = await (await fetch(url)).blob();
  const png = blob.type === "image/png" ? blob : await toPng(blob);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

async function toPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không đổi được ảnh"))), "image/png"));
}
