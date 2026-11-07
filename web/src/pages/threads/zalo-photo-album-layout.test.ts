import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { albumScale, linearPartition, zaloAlbumLayout } from "./zalo-photo-album-layout";

const size = (width: number, height: number) => ({ width, height });
/** Ô trong cùng một hàng có cùng `y`: đếm số ô mỗi hàng */
const rowsOf = (cells: Array<{ y: number }>) => [...cells.reduce((m, c) => m.set(c.y, (m.get(c.y) ?? 0) + 1), new Map<number, number>()).values()];

describe("xếp chùm ảnh như Zalo PC", () => {
  it("chia dãy tỉ lệ thành k hàng đều nhau, giữ thứ tự; hòa thì cắt sớm như Zalo", () => {
    assert.deepEqual(linearPartition([1, 1, 1], 2), [[1], [1, 1]]);
    assert.deepEqual(linearPartition([1, 2, 3, 4], 2), [[1, 2, 3], [4]]);
    assert.deepEqual(linearPartition([1, 1], 3), [[1], [1]]);
    assert.deepEqual(linearPartition([5, 1, 1], 1), [[5, 1, 1]]);
  });

  it("6 ảnh như ảnh chụp Zalo: 3 hàng x 2, ảnh dài ở hàng cuối hẹp lại và hiện nguyên ảnh", () => {
    const photos = [...Array.from({ length: 5 }, () => size(2160, 1480)), size(300, 1500)];
    const l = zaloAlbumLayout(photos);
    assert.deepEqual(rowsOf(l.cells), [2, 2, 2]);
    assert.equal(l.width, 450);
    const [, , , , wide, tall] = l.cells;
    assert.equal(wide!.height, tall!.height, "cùng hàng thì cùng chiều cao");
    assert.ok(tall!.width < wide!.width / 3, "ảnh dài chỉ chiếm phần hẹp");
    assert.equal(tall!.fit, "contain");
    assert.equal(tall!.x + tall!.width, 450, "ảnh cuối hàng lấp tới mép phải");
  });

  it("3 ảnh ngang như nhau: 1 ảnh to ở trên, 2 ảnh dưới; chỉ bo 4 góc ngoài", () => {
    const l = zaloAlbumLayout([size(2000, 1200), size(2000, 1200), size(2000, 1200)]);
    assert.deepEqual(rowsOf(l.cells), [1, 2]);
    assert.equal(l.cells[0]!.width, 450);
    assert.ok(Math.abs(l.cells[0]!.height - 450 / (2000 / 1200)) < 1);
    assert.deepEqual(l.cells.map((c) => c.radius), [
      [8, 8, 0, 0],
      [0, 0, 0, 8],
      [0, 0, 8, 0],
    ]);
    assert.ok(l.cells.every((c) => c.fit === "cover"));
  });

  it("hai ảnh dọc: một hàng, cao bằng nhau; không biết cỡ ảnh thì coi là ảnh vuông", () => {
    const l = zaloAlbumLayout([size(720, 1280), size(720, 1280)]);
    assert.deepEqual(rowsOf(l.cells), [2]);
    assert.equal(l.cells[0]!.height, l.cells[1]!.height);
    const unknown = zaloAlbumLayout([{ width: null, height: null }, { width: null, height: null }]);
    assert.deepEqual([unknown.cells[0]!.width, unknown.cells[0]!.height], [224, 224], "ô vuông, hai ô chia đôi khung");
  });

  it("hơn 10 ảnh: lưới ô vuông 90px, 4 cột", () => {
    const l = zaloAlbumLayout(Array.from({ length: 12 }, () => size(1000, 1000)));
    assert.deepEqual(rowsOf(l.cells), [4, 4, 4]);
    assert.ok(l.cells.every((c) => c.width === 90 && c.height === 90));
    assert.equal(l.width, 4 * 92 - 2);
  });

  it("thu nhỏ theo chỗ trống, không quá 450px, không dưới 270px", () => {
    assert.equal(albumScale(800), 1);
    assert.equal(albumScale(360), 360 / 450);
    assert.equal(albumScale(100), 270 / 450);
    assert.equal(albumScale(400, 366), 1, "khung hẹp hơn 450 (lưới ô vuông) mà đủ chỗ thì giữ nguyên cỡ");
  });
});
