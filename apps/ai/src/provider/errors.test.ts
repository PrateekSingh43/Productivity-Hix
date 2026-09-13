import { describe, it, expect } from "vitest";
import { AIError, sanitizeErrorMessage, wrapProviderError } from "./errors";

describe("sanitizeErrorMessage", () => {
  it("redacts provided secrets and common key patterns", () => {
    const message = sanitizeErrorMessage(
      "failed with key=secret-value and AIzaSyDummyKeyValue1234567890 and Bearer abc.def",
      ["secret-value"],
    );
    expect(message).not.toContain("secret-value");
    expect(message).not.toContain("AIzaSyDummyKeyValue1234567890");
    expect(message).not.toContain("Bearer abc.def");
    expect(message).toContain("[redacted]");
  });

  it("handles empty secrets array", () => {
    const message = sanitizeErrorMessage("plain error message", []);
    expect(message).toBe("plain error message");
  });

  it("handles undefined secrets", () => {
    const message = sanitizeErrorMessage("error text", [undefined, undefined]);
    expect(message).toBe("error text");
  });

  it("redacts Gemini key patterns (AIza...)", () => {
    const message = sanitizeErrorMessage(
      "invalid key AIzaSyAbcdefghijklmnop",
      [],
    );
    expect(message).not.toContain("AIzaSyAbcdefghijklmnop");
    expect(message).toContain("[redacted]");
  });

  it("redacts Groq key patterns (gsk_...)", () => {
    const message = sanitizeErrorMessage(
      "invalid key gsk_live_abc123def456ghi789",
      [],
    );
    expect(message).not.toContain("gsk_live_abc123def456ghi789");
    expect(message).toContain("[redacted]");
  });
});

describe("wrapProviderError", () => {
  it("maps 401 as authentication failure", () => {
    const error = wrapProviderError({ message: "nope", status: 401 }, "gemini", ["unused-key"]);
    expect(error.code).toBe("auth");
    expect(error.statusCode).toBe(401);
    expect(error.provider).toBe("gemini");
  });

  it("maps 403 as authentication failure", () => {
    const error = wrapProviderError({ message: "forbidden", status: 403 }, "groq", []);
    expect(error.code).toBe("auth");
    expect(error.statusCode).toBe(401);
    expect(error.provider).toBe("groq");
  });

  it("maps 429 as rate limit", () => {
    const error = wrapProviderError({ message: "slow down", status: 429 }, "groq", []);
    expect(error.code).toBe("rate_limit");
    expect(error.statusCode).toBe(429);
  });

  it("maps 500+ as unavailable", () => {
    const error = wrapProviderError({ message: "internal error", status: 500 }, "gemini", []);
    expect(error.code).toBe("unavailable");
    expect(error.statusCode).toBe(503);
  });

  it("maps 502 as unavailable", () => {
    const error = wrapProviderError({ message: "bad gateway", status: 502 }, "groq", []);
    expect(error.code).toBe("unavailable");
    expect(error.statusCode).toBe(503);
  });

  it("maps 503 as unavailable", () => {
    const error = wrapProviderError({ message: "service unavailable", status: 503 }, "gemini", []);
    expect(error.code).toBe("unavailable");
    expect(error.statusCode).toBe(503);
  });

  it("maps timeout errors as unavailable", () => {
    const error = wrapProviderError(new Error("request timeout"), "gemini", []);
    expect(error.code).toBe("unavailable");
    expect(error.statusCode).toBe(503);
  });

  it("maps network errors as unavailable", () => {
    const error = wrapProviderError(new Error("network error: connection refused"), "groq", []);
    expect(error.code).toBe("unavailable");
    expect(error.statusCode).toBe(503);
  });

  it("maps ECONNREFUSED as unavailable", () => {
    const error = wrapProviderError(new Error("ECONNREFUSED 127.0.0.1:443"), "gemini", []);
    expect(error.code).toBe("unavailable");
    expect(error.statusCode).toBe(503);
  });

  it("maps fetch failed as unavailable", () => {
    const error = wrapProviderError(new Error("fetch failed: timeout"), "gemini", []);
    expect(error.code).toBe("unavailable");
    expect(error.statusCode).toBe(503);
  });

  it("maps 400 as invalid_request", () => {
    const error = wrapProviderError({ message: "bad request", status: 400 }, "gemini", []);
    expect(error.code).toBe("invalid_request");
    expect(error.statusCode).toBe(400);
  });

  it("maps 404 as invalid_request", () => {
    const error = wrapProviderError({ message: "not found", status: 404 }, "groq", []);
    expect(error.code).toBe("invalid_request");
    expect(error.statusCode).toBe(400);
  });

  it("maps 422 as invalid_request", () => {
    const error = wrapProviderError({ message: "unprocessable", status: 422 }, "gemini", []);
    expect(error.code).toBe("invalid_request");
    expect(error.statusCode).toBe(400);
  });

  it("maps unknown errors as generic provider error", () => {
    const error = wrapProviderError(new Error("something unexpected"), "groq", []);
    expect(error.code).toBe("provider");
    expect(error.statusCode).toBe(502);
  });

  it("handles non-Error unknown values", () => {
    const error = wrapProviderError("string error", "gemini", []);
    expect(error).toBeInstanceOf(AIError);
    expect(error.code).toBe("provider");
    expect(error.message).toBe("Unknown provider error");
  });

  it("handles null unknown value", () => {
    const error = wrapProviderError(null, "groq", []);
    expect(error).toBeInstanceOf(AIError);
    expect(error.code).toBe("provider");
  });

  it("does not leak secrets from provider messages", () => {
    const error = wrapProviderError(
      new Error("invalid key gsk_supersecretvalue1234567890"),
      "groq",
      ["gsk_supersecretvalue1234567890"],
    );
    expect(error.message).not.toContain("gsk_supersecretvalue1234567890");
    expect(error).toBeInstanceOf(AIError);
  });

  it("does not leak Gemini API key from error messages", () => {
    const error = wrapProviderError(
      new Error("auth failed AIzaSyAbcdefghijklmnop"),
      "gemini",
      ["AIzaSyAbcdefghijklmnop"],
    );
    expect(error.message).not.toContain("AIzaSyAbcdefghijklmnop");
    expect(error).toBeInstanceOf(AIError);
  });

  it("passes through existing AIError instances", () => {
    const original = new AIError("already wrapped", "auth", 401, "gemini");
    const result = wrapProviderError(original, "gemini", []);
    expect(result).toBe(original);
  });

  it("maps connectivity failures as unavailable", () => {
    const error = wrapProviderError(new Error("fetch failed: timeout"), "gemini", []);
    expect(error.code).toBe("unavailable");
    expect(error.statusCode).toBe(503);
  });
});
