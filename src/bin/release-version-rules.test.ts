import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { releaseVersionProblem } from "./release-version-rules.js";

describe("pnpm release: kiểm số phiên bản", () => {
  it("chỉ nhận X.Y.Z lớn hơn bản hiện tại", () => {
    assert.equal(releaseVersionProblem("0.3.0", "0.4.0"), null);
    assert.equal(releaseVersionProblem("0.9.0", "0.10.0"), null);
    assert.match(releaseVersionProblem("0.4.0", "0.4.0")!, /lớn hơn/);
    assert.match(releaseVersionProblem("0.4.0", "0.3.9")!, /lớn hơn/);
    for (const bad of [undefined, "v0.5.0", "0.5", "0.5.0-beta"]) assert.match(releaseVersionProblem("0.4.0", bad)!, /X\.Y\.Z/);
  });
});
