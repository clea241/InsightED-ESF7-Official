import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import {
  assertJwtSecret,
  getJwtSecret,
  MIN_JWT_SECRET_LENGTH,
} from "../../../src/config/auth.ts";
import {
  jwtMiddleware,
  extractBearerToken,
} from "../../../src/middleware/jwt.ts";

describe("src/config/auth.ts - JWT Secret Validation", () => {
  it("enforces minimum secret length of at least 32 characters (256 bits)", () => {
    expect(MIN_JWT_SECRET_LENGTH).toBe(32);
  });

  it("throws fatal error if JWT_SECRET is missing or empty", () => {
    expect(() => assertJwtSecret({ JWT_SECRET: "" })).toThrow(
      /missing or empty/i,
    );
    expect(() => assertJwtSecret({ JWT_SECRET: "   " })).toThrow(
      /missing or empty/i,
    );
    expect(() => assertJwtSecret({})).toThrow(/missing or empty/i);
  });

  it("throws fatal error if JWT_SECRET is shorter than 32 characters", () => {
    expect(() => assertJwtSecret({ JWT_SECRET: "short" })).toThrow(/too weak/i);
    expect(() => assertJwtSecret({ JWT_SECRET: "a".repeat(16) })).toThrow(
      /too weak/i,
    );
    expect(() => assertJwtSecret({ JWT_SECRET: "a".repeat(31) })).toThrow(
      /too weak/i,
    );
  });

  it("succeeds and returns secret when JWT_SECRET is 32 characters or longer", () => {
    const validSecret32 = "a".repeat(32);
    expect(assertJwtSecret({ JWT_SECRET: validSecret32 })).toBe(validSecret32);
    expect(getJwtSecret({ JWT_SECRET: validSecret32 })).toBe(validSecret32);

    const valid64HexSecret =
      "7648c1a70591a0e6d75241e69055786b5e0b9e23f926b18589aa5e004a26c6bf";
    expect(assertJwtSecret({ JWT_SECRET: valid64HexSecret })).toBe(
      valid64HexSecret,
    );
  });
});

describe("src/middleware/jwt.ts - Authentication Gate", () => {
  const testSecret = "0123456789012345678901234567890123456789";

  it("extracts valid Bearer token", () => {
    const req = {
      headers: { authorization: "Bearer my-token-123" },
    };
    expect(extractBearerToken(req)).toBe("my-token-123");
  });

  it("returns null for missing or non-Bearer authorization header", () => {
    expect(extractBearerToken({ headers: {} })).toBeNull();
    expect(
      extractBearerToken({ headers: { authorization: "Basic 123" } }),
    ).toBeNull();
    expect(
      extractBearerToken({
        headers: { authorization: "BearerTokenWithoutSpace" },
      }),
    ).toBeNull();
  });

  it("rejects request without token with 401", () => {
    let statusCode = null;
    let jsonBody = null;
    let nextCalled = false;

    const req = { headers: {} };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
      },
    };
    const next = () => {
      nextCalled = true;
    };

    jwtMiddleware(req, res, next);
    expect(statusCode).toBe(401);
    expect(jsonBody).toHaveProperty("error");
    expect(nextCalled).toBe(false);
  });

  it("verifies valid token and attaches user claims to request", () => {
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = testSecret;

    try {
      const token = jwt.sign(
        { uid: "user-100", school_id: "302261", role: "school head" },
        testSecret,
        { algorithm: "HS256" },
      );

      let nextCalled = false;
      const req = {
        headers: { authorization: `Bearer ${token}` },
      };
      const res = {
        status() {
          return this;
        },
        json() {},
      };
      const next = () => {
        nextCalled = true;
      };

      jwtMiddleware(req, res, next);
      expect(nextCalled).toBe(true);
      expect(req.user?.uid).toBe("user-100");
      expect(req.user?.school_id).toBe("302261");
      expect(req.auth?.schoolId).toBe("302261");
    } finally {
      process.env.JWT_SECRET = oldSecret;
    }
  });

  it("rejects invalid/tampered token with 401", () => {
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = testSecret;

    try {
      let statusCode = null;
      let nextCalled = false;
      const req = {
        headers: { authorization: "Bearer invalid.token.signature" },
      };
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json() {},
      };
      const next = () => {
        nextCalled = true;
      };

      jwtMiddleware(req, res, next);
      expect(statusCode).toBe(401);
      expect(nextCalled).toBe(false);
    } finally {
      process.env.JWT_SECRET = oldSecret;
    }
  });
});
