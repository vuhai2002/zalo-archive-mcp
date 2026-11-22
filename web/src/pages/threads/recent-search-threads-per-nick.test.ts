import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  forgetRecentThread,
  loadRecentThreads,
  rememberRecentThread,
  updateRecentThread,
  type RecentStore,
  type RecentThread,
} from "./recent-search-threads";

/** localStorage giả trong bộ nhớ */
function fakeStore(init: Record<string, string> = {}): RecentStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const r = (threadId: string, name = threadId): RecentThread => ({ threadId, threadType: "user", name, avatarUrl: null });
const ids = (list: RecentThread[]) => list.map((x) => x.threadId);

describe("Tìm gần đây theo từng nick", () => {
  it("mỗi nick một danh sách: mở, sửa, xóa ở nick này không lộ hay đụng sang nick kia", () => {
    const store = fakeStore();
    rememberRecentThread("nick-a", r("u-lan"), store);
    rememberRecentThread("nick-a", r("g-1"), store);
    rememberRecentThread("nick-b", r("u-minh"), store);

    assert.deepEqual(ids(loadRecentThreads("nick-a", store)), ["g-1", "u-lan"]);
    assert.deepEqual(ids(loadRecentThreads("nick-b", store)), ["u-minh"]);
    assert.deepEqual(loadRecentThreads("nick-c", store), [], "nick chưa tìm gì thì trống");

    assert.deepEqual(ids(forgetRecentThread("nick-b", "u-minh", store)), []);
    assert.deepEqual(ids(loadRecentThreads("nick-a", store)), ["g-1", "u-lan"], "xóa ở nick B không đụng nick A");

    updateRecentThread("nick-a", r("u-lan", "Lan (tên mới)"), store);
    assert.equal(loadRecentThreads("nick-a", store)[1]?.name, "Lan (tên mới)");
  });

  it("danh sách chung kiểu cũ (không biết của nick nào) thì không hiện cho nick nào và bị xóa", () => {
    const store = fakeStore({ "zalo-archive.recent-search-threads": JSON.stringify([r("u-lan")]) });
    assert.deepEqual(loadRecentThreads("nick-b", store), []);
    assert.equal(store.data.has("zalo-archive.recent-search-threads"), false);
  });

  it("trình duyệt chặn lưu thì danh sách trống, không lỗi", () => {
    const blocked: RecentStore = {
      getItem: () => {
        throw new Error("chặn");
      },
      setItem: () => {
        throw new Error("chặn");
      },
      removeItem: () => {
        throw new Error("chặn");
      },
    };
    assert.deepEqual(loadRecentThreads("nick-a", blocked), []);
    assert.doesNotThrow(() => rememberRecentThread("nick-a", r("u-lan"), blocked));
  });
});
