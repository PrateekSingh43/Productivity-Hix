import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AIError, sanitizeErrorMessage, wrapProviderError } from "./errors";

describe("sanitizeErrorMessage", () => {
  it("redacts provided secrets and common key patterns", () => {
    const message = sanitizeErrorMessage(
      "failed with key=secret-value and AIzaSyDummyKeyValue1234567890 and Bearer abc.def",
      ["secret-value"],
    );
    assert.equal(message.includes("secret-value"), false);
    assert.equal(message.includes("AIzaSyDummyKeyValue1234567890"), false);
    assert.equal(message.includes("Bearer abc.def"), false);
    assert.equal(message.includes("[redacted]"), true);
  });
});

describe("wrapProviderError", () => {
  it("maps authentication failures", () => {
    const error = wrapProviderError({ message: "nope", status: 401 }, "gemini", ["unused-key"]);
    assert.equal(error.code, "auth");
    assert.equal(error.statusCode, 401);
    assert.equal(error.provider, "gemini");
  });

  it("maps rate limits", () => {
    const error = wrapProviderError({ message: "slow down", status: 429 }, "groq", []);
    assert.equal(error.code, "rate_limit");
    assert.equal(error.statusCode, 429);
  });

  it("does not leak secrets from provider messages", () => {
    const error = wrapProviderError(
      new Error("invalid key gsk_supersecretvalue1234567890"),
      "groq",
      ["gsk_supersecretvalue1234567890"],
    );
    assert.equal(error.message.includes("gsk_supersecretvalue1234567890"), false);
    assert.equal(error instanceof AIError, true);
  });

  it("maps connectivity failures as unavailable", () => {
    const error = wrapProviderError(new Error("fetch failed: timeout"), "gemini", []);
    assert.equal(error.code, "unavailable");
    assert.equal(error.statusCode, 503);
  });
});
