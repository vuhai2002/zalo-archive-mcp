import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { videoInfoOf } from "./zalo-video-info.js";

describe("thông số video Zalo", () => {
  it("đọc thời lượng + kích thước từ chuỗi JSON hay object", () => {
    assert.deepEqual(videoInfoOf('{"duration":47000,"video_height":1280,"video_width":720,"video_rotation":0}'), {
      durationMs: 47000,
      width: 720,
      height: 1280,
    });
    assert.deepEqual(videoInfoOf({ duration: "6000", video_width: 640, video_height: 360 }), { durationMs: 6000, width: 640, height: 360 });
  });

  it("video xoay 90 độ thì đổi chiều rộng - cao; thiếu trường thì null, hỏng hết thì null", () => {
    assert.deepEqual(videoInfoOf({ duration: 5000, video_width: 1920, video_height: 1080, video_rotation: 90 }), { durationMs: 5000, width: 1080, height: 1920 });
    assert.deepEqual(videoInfoOf({ fileSize: 100, duration: 0, video_width: 720 }), { durationMs: null, width: 720, height: null });
    assert.equal(videoInfoOf("không phải json"), null);
    assert.equal(videoInfoOf({ fileSize: 100 }), null);
    assert.equal(videoInfoOf(null), null);
  });
});
