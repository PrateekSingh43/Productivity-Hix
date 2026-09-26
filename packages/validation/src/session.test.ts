import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sessionListQuerySchema } from "./session";

describe("sessionListQuerySchema", () => {
  it("parses empty query params with default undefined", () => {
    const parsed = sessionListQuerySchema.parse({});
    assert.equal(parsed.from, undefined);
    assert.equal(parsed.to, undefined);
    assert.equal(parsed.limit, undefined);
    assert.equal(parsed.taskId, undefined);
    assert.equal(parsed.search, undefined);
  });

  it("coerces date strings and numeric limits", () => {
    const parsed = sessionListQuerySchema.parse({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-26T23:59:59.999Z",
      limit: "100",
      taskId: "task-123",
      search: "react query",
    });
    assert.ok(parsed.from instanceof Date);
    assert.ok(parsed.to instanceof Date);
    assert.equal(parsed.limit, 100);
    assert.equal(parsed.taskId, "task-123");
    assert.equal(parsed.search, "react query");
  });

  it("rejects limits exceeding 500", () => {
    assert.throws(() => sessionListQuerySchema.parse({ limit: 501 }));
  });
});
