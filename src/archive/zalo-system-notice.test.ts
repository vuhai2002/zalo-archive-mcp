import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupEventNoticeOf, msgInfoNoticeOf, type NoticeNames, type SystemNotice } from "./zalo-system-notice.js";

const ME = "100";
const names: NoticeNames = { selfUid: ME, nameOf: (uid) => ({ "1": "Mẫn Khuê Trác", "2": "Quế Khuê" })[uid] ?? null };
const ev = (act: string, sourceId: string, members: Array<[string, string?]>, groupName?: string) => ({
  act,
  data: { groupId: "9", sourceId, groupName, updateMembers: members.map(([id, dName]) => ({ id, dName })) },
});
/** Câu kèm các đoạn in đậm, để so một lần */
const shown = (n: SystemNotice | null) => n && { text: n.text, bold: n.bold.map((b) => n.text.slice(b.start, b.end)) };

describe("câu thông báo nhóm như Zalo", () => {
  it("thêm người: người được thêm đứng đầu, người thêm sau chữ 'được'; tên in đậm, 'bạn' không", () => {
    assert.deepEqual(shown(groupEventNoticeOf(ev("join", "1", [["2"]]), names)), {
      text: "Quế Khuê được Mẫn Khuê Trác thêm vào nhóm",
      bold: ["Quế Khuê", "Mẫn Khuê Trác"],
    });
    assert.deepEqual(shown(groupEventNoticeOf(ev("join", ME, [["2"]]), names)), {
      text: "Quế Khuê được bạn thêm vào nhóm",
      bold: ["Quế Khuê"],
    });
    assert.equal(groupEventNoticeOf(ev("join", "1", [[ME], ["2"]]), names)?.text, "Bạn và Quế Khuê được Mẫn Khuê Trác thêm vào nhóm");
  });

  it("tự vào, rời, xóa, chặn, phó nhóm, đổi tên, đổi ảnh dùng đúng mẫu câu của Zalo", () => {
    const t = (e: unknown) => groupEventNoticeOf(e, names)?.text;
    assert.equal(t(ev("join", "2", [["2"]])), "Quế Khuê đã tham gia nhóm");
    assert.equal(t(ev("leave", "2", [["2"]])), "Quế Khuê đã rời khỏi nhóm");
    assert.equal(t(ev("leave", "2", [])), "Quế Khuê đã rời khỏi nhóm");
    assert.equal(t(ev("remove_member", "1", [["2"]])), "Quế Khuê được Mẫn Khuê Trác xóa khỏi nhóm");
    assert.equal(t(ev("block_member", ME, [["2"]])), "Quế Khuê bị bạn chặn khỏi nhóm này");
    assert.equal(t(ev("add_admin", "1", [["2"]])), "Quế Khuê đã được bổ nhiệm thành phó nhóm");
    assert.equal(t(ev("remove_admin", "1", [["2"]])), "Quế Khuê đã không còn là phó nhóm");
    assert.equal(t(ev("update_avatar", "1", [])), "Mẫn Khuê Trác đổi ảnh đại diện nhóm");
    assert.deepEqual(shown(groupEventNoticeOf(ev("update", ME, [], "NHOM-MAU-01"), names)), {
      text: "Bạn đổi tên nhóm thành NHOM-MAU-01",
      bold: ["NHOM-MAU-01"],
    });
    assert.equal(t(ev("new_pin_topic", "1", [])), undefined);
  });

  it("nhiều người: vài tên đầu rồi 'và N người nữa'; chưa biết tên thì lấy tên trong sự kiện, rồi mới tới mã số", () => {
    const many = ev("join", "1", [["2"], ["31", "An"], ["32", "Bảo"], ["33", "Chi"], ["34", "Dũng"]]);
    assert.equal(groupEventNoticeOf(many, names)?.text, "Quế Khuê, An, Bảo và 2 người nữa được Mẫn Khuê Trác thêm vào nhóm");
    assert.equal(groupEventNoticeOf(ev("leave", "777", []), names)?.text, "777 đã rời khỏi nhóm");
  });

  it("avatar đứng trước câu: người được nhắc tới (thêm / rời), người làm (đổi tên / ảnh)", () => {
    const withAvatar = { act: "join", data: { sourceId: "1", updateMembers: [{ id: "2", avatar: "https://s160-ava-talk.zadn.vn/a.jpg" }] } };
    assert.deepEqual(groupEventNoticeOf(withAvatar, names)?.avatar, { userId: "2", url: "https://s160-ava-talk.zadn.vn/a.jpg" });
    assert.deepEqual(groupEventNoticeOf(ev("update_avatar", "1", []), names)?.avatar, { userId: "1", url: null });
  });
});

describe("thông báo msginfo.actionlist (xin vào nhóm, xác nhận lịch hẹn)", () => {
  const content = (vi: string, dpns: string[], extra: Record<string, unknown> = {}) => ({
    title: "tiêu đề dự phòng",
    action: "msginfo.actionlist",
    params: JSON.stringify({ msg: { vi, en: "x" }, highLightsV2: dpns.map((dpn) => ({ uid: 2060000000000000000, dpn })), ...extra }),
  });

  it("thay %N$s bằng tên in đậm theo mẫu câu Zalo gửi kèm; avatar là ảnh Zalo gửi kèm", () => {
    const n = msgInfoNoticeOf(content("%1$s vừa yêu cầu tham gia nhóm.", ["Quế Khuê"], { avatarUrl: "https://s160-ava-talk.zadn.vn/t.jpg" }));
    assert.deepEqual(shown(n), { text: "Quế Khuê vừa yêu cầu tham gia nhóm.", bold: ["Quế Khuê"] });
    assert.deepEqual(n?.avatar, { userId: null, url: "https://s160-ava-talk.zadn.vn/t.jpg" });
    const rsvp = msgInfoNoticeOf(content("%1$s xác nhận: tham gia %2$s.", ["Lư Ngạn", "Họp tuần"], { iconUrl: "https://res-zalo.zadn.vn/i.png" }));
    assert.deepEqual(shown(rsvp), { text: "Lư Ngạn xác nhận: tham gia Họp tuần.", bold: ["Lư Ngạn", "Họp tuần"] });
    assert.equal(rsvp?.avatar?.url, "https://res-zalo.zadn.vn/i.png");
  });

  it("không có mẫu câu thì dùng tiêu đề; tin webchat thường thì không phải thông báo", () => {
    assert.equal(msgInfoNoticeOf({ title: "Ai đó vừa làm gì", action: "msginfo.actionlist", params: "{}" })?.text, "Ai đó vừa làm gì");
    assert.equal(msgInfoNoticeOf("chào anh"), null);
    assert.equal(msgInfoNoticeOf({ title: "Link", action: "recommened.link" }), null);
  });
});
