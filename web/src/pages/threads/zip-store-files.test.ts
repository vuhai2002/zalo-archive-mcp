import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStoreZip, crc32 } from "./zip-store-files";

/** Đọc lại zip vừa dựng theo mục lục cuối file: tên, cỡ, crc, dữ liệu, cờ UTF-8 */
function readZip(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const endAt = zip.length - 22;
  assert.equal(v.getUint32(endAt, true), 0x06054b50);
  const count = v.getUint16(endAt + 10, true);
  let p = v.getUint32(endAt + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50);
    const flags = v.getUint16(p + 8, true);
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const localAt = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.slice(p + 46, p + 46 + nameLen));
    assert.equal(v.getUint32(localAt, true), 0x04034b50);
    const dataAt = localAt + 30 + v.getUint16(localAt + 26, true);
    out.push({ name, flags, crc, data: new TextDecoder().decode(zip.slice(dataAt, dataAt + size)) });
    p += 46 + nameLen;
  }
  return out;
}

describe("nén thư mục thành .zip (không nén)", () => {
  it("crc32 đúng chuẩn", () => {
    assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
  });

  it("đọc lại được đủ file, đúng tên có dấu (UTF-8), đúng dữ liệu và crc", () => {
    const enc = new TextEncoder();
    const when = new Date("2026-03-10T07:00:00.000Z");
    const zip = buildStoreZip([
      { name: "thu-muc-mau/ghi-chú.txt", data: enc.encode("nội dung thử"), modified: when },
      { name: "thu-muc-mau/con/rong.txt", data: new Uint8Array(0), modified: when },
    ]);
    const files = readZip(zip);
    assert.deepEqual(
      files.map((f) => [f.name, f.data, f.flags & 0x0800]),
      [
        ["thu-muc-mau/ghi-chú.txt", "nội dung thử", 0x0800],
        ["thu-muc-mau/con/rong.txt", "", 0x0800],
      ],
    );
    assert.equal(files[0]!.crc, crc32(enc.encode("nội dung thử")));
  });
});
