import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileTypeOfName } from "./file-type-of-name";
import { firstMatchIndex, snippetAround } from "./search-snippet";

describe("đoạn trích quanh chữ khớp", () => {
  it("chữ khớp gần đầu: giữ nguyên câu (gộp xuống dòng)", () => {
    assert.equal(snippetAround("Hẹn ở quán\nQuế Lư nhé", "que lu"), "Hẹn ở quán Quế Lư nhé");
  });

  it("chữ khớp nằm xa: cắt phía trước tại ranh giới từ, mở đầu bằng ...", () => {
    assert.equal(snippetAround("một hai ba bốn năm sáu bảy tám chín mười Quế Lư ở Bàu Lý", "que lu", 10), "... chín mười Quế Lư ở Bàu Lý");
  });

  it("vị trí khớp không dấu / không hoa thường, lấy chỗ khớp sớm nhất trong các từ; không khớp thì -1", () => {
    assert.equal(firstMatchIndex("Quán Quế Lư", "LƯ quan"), 0);
    assert.equal(firstMatchIndex("Đi Bàu Lý", "bau ly"), 3);
    assert.equal(firstMatchIndex("abc", "xyz"), -1);
    assert.equal(snippetAround("không khớp gì cả", "xyz"), "không khớp gì cả");
  });
});

describe("loại file theo tên", () => {
  it("nén / nhạc / video / ảnh có biểu tượng; văn phòng có chữ viết tắt; lạ thì file xám", () => {
    assert.deepEqual(fileTypeOfName("Ảnh sự kiện.zip"), { icon: "zip", label: null, tone: "purple" });
    assert.equal(fileTypeOfName("Quán Quế Lư.M4A").icon, "audio");
    assert.equal(fileTypeOfName("1005(4).mp4").icon, "video");
    assert.equal(fileTypeOfName("ChatGPT Image.png").tone, "teal");
    assert.equal(fileTypeOfName("2020 Tai lieu.pdf").label, "PDF");
    assert.equal(fileTypeOfName("2020.01.15. Khung mau 7.psd").label, "Ps");
    assert.equal(fileTypeOfName("Kế hoạch.xlsx").label, "X");
    assert.deepEqual(fileTypeOfName("tai-lieu-khong-duoi"), { icon: "file", label: null, tone: "gray" });
    assert.equal(fileTypeOfName(null).icon, "file");
  });
});
