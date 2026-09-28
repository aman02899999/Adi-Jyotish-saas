import { describe, expect, it } from "vitest";

import { readJsonBody } from "@/lib/request-body";

const req = (body?: string) => new Request("http://localhost/x", { method: "POST", body });

describe("readJsonBody", () => {
  it("returns the parsed object", async () => {
    expect(await readJsonBody(req('{"email":"a@b.test"}'))).toEqual({ email: "a@b.test" });
  });

  it("returns {} for a malformed, empty or non-object body, instead of throwing", async () => {
    expect(await readJsonBody(req("not-json{"))).toEqual({});
    expect(await readJsonBody(req())).toEqual({});
    expect(await readJsonBody(req("null"))).toEqual({});
    expect(await readJsonBody(req("42"))).toEqual({});
    expect(await readJsonBody(req('"text"'))).toEqual({});
  });
});

describe("asText", () => {
  it("passes strings through and treats every other type as missing", async () => {
    const { asText } = await import("@/lib/request-body");
    expect(asText(" a ")).toBe(" a ");
    for (const value of [123, ["x"], {}, null, undefined, true]) expect(asText(value)).toBeUndefined();
  });
});
