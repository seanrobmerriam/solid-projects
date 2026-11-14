import { expect, test } from "bun:test";
import { appOrigin } from "../../src/server/origin";
import { verifyMutationOrigin } from "../../src/server/workspace";

test("local OAuth callbacks keep the actual server port", () => {
  expect(appOrigin(new Request("http://localhost:3003/auth/callback"), "http://localhost:3000"))
    .toBe("http://localhost:3003");
});

test("production keeps its public HTTPS origin behind a local proxy", () => {
  expect(appOrigin(new Request("http://127.0.0.1:3000/auth/callback"), "https://solid.typesayfe.com"))
    .toBe("https://solid.typesayfe.com");
});

test("forwarded headers cannot override the configured origin", () => {
  expect(appOrigin(new Request("http://internal:3000/auth/callback", {
    headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" }
  }), "https://solid.typesayfe.com")).toBe("https://solid.typesayfe.com");
});

test("local writes accept the actual port and reject other origins", () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "http://localhost:3000";
  try {
    expect(() => verifyMutationOrigin(new Request("http://localhost:3003/api/workspace/items", {
      headers: { Origin: "http://localhost:3003" }
    }))).not.toThrow();
    expect(() => verifyMutationOrigin(new Request("http://localhost:3003/api/workspace/items", {
      headers: { Origin: "http://localhost:3000" }
    }))).toThrow();
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});
