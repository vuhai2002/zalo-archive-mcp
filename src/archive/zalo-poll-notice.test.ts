import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pollEventFromRawJson, pollEventOf, pollNoticeOf } from "./zalo-poll-notice.js";

/** Đúng hình dạng tin `group.poll` Zalo gửi: params là CHUỖI JSON, uid trong params là số 19 chữ số */
const raw = (action: string, vi: string | null, from = "320000000000000106") =>
  JSON.stringify({
    msgId: "8400014000117",
    msgType: "group.poll",
    uidFrom: from,
    dName: "Ngạn Zalo",
    content: {
      title: "",
      action,
      params: `{"msg":${vi === null ? "{}" : JSON.stringify({ vi, en: "x" })},"uid":320000000000000106,"isAnonymous":false,"question":"Ăn trưa ở đâu đây?","pollId":1100000001,"groupId":2150000000000000110,"dName":"Ngạn Zalo","pollVer":1}`,
    },
  });

const names = { selfUid: "999", nameOf: (uid: string) => (uid === "320000000000000106" ? "Chị Lan" : null) };
const bolded = (n: { text: string; bold: Array<{ start: number; end: number }> }) => n.bold.map((b) => n.text.slice(b.start, b.end));

describe("tin bình chọn (group.poll)", () => {
  it("lấy mã bình chọn đúng từng chữ số, hành động, câu hỏi, người làm (uidFrom dạng chuỗi)", () => {
    const ev = pollEventFromRawJson(raw("vote", "%1$s tham gia cuộc bình chọn: %2$s"));
    assert.deepEqual(ev && { ...ev, template: undefined }, {
      pollId: "1100000001",
      action: "vote",
      question: "Ăn trưa ở đâu đây?",
      actorId: "320000000000000106",
      actorName: "Ngạn Zalo",
      template: undefined,
    });
  });

  it("câu như Zalo: tên (danh bạ trước) và câu hỏi in đậm; chính mình là Bạn", () => {
    const n = pollNoticeOf(pollEventFromRawJson(raw("update", "%1$s đổi lựa chọn trong cuộc bình chọn: %2$s"))!, names);
    assert.equal(n.text, "Chị Lan đổi lựa chọn trong cuộc bình chọn: Ăn trưa ở đâu đây?");
    assert.deepEqual(bolded(n), ["Chị Lan", "Ăn trưa ở đâu đây?"]);
    const mine = pollNoticeOf(pollEventFromRawJson(raw("vote", "%1$s tham gia cuộc bình chọn: %2$s", "999"))!, names);
    assert.equal(mine.text, "Bạn tham gia cuộc bình chọn: Ăn trưa ở đâu đây?");
  });

  it("thiếu mẫu câu thì dùng câu dự phòng theo hành động; chưa có trong danh bạ thì dùng tên Zalo gửi kèm", () => {
    const n = pollNoticeOf(pollEventFromRawJson(raw("close", null, "123"))!, names);
    assert.equal(n.text, "Ngạn Zalo khóa bình chọn: Ăn trưa ở đâu đây?");
  });

  it("dữ liệu không phải tin bình chọn thì bỏ qua", () => {
    assert.equal(pollEventOf({ content: "chữ thường" }), null);
    assert.equal(pollEventFromRawJson("không phải json"), null);
    assert.equal(pollEventFromRawJson(null), null);
  });
});
