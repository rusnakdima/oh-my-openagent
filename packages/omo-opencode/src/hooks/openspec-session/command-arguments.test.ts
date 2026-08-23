import { describe, expect, it } from "bun:test";
import { parseOpenSpecCommand } from "./command-arguments";

describe("parseOpenSpecCommand", () => {
  it("returns help for empty input", () => {
    const result = parseOpenSpecCommand("");
    expect(result.kind).toBe("help");
  });

  it("returns help for whitespace-only input", () => {
    const result = parseOpenSpecCommand("   \n  ");
    expect(result.kind).toBe("help");
  });

  it("parses propose with just a name", () => {
    const result = parseOpenSpecCommand("propose myspec");
    expect(result.kind).toBe("propose");
    expect(result.specName).toBe("myspec");
    expect(result.description).toBeUndefined();
  });

  it("parses propose with name and description", () => {
    const result = parseOpenSpecCommand("propose myspec This is a description");
    expect(result.kind).toBe("propose");
    expect(result.specName).toBe("myspec");
    expect(result.description).toBe("This is a description");
  });

  it("parses verify", () => {
    const result = parseOpenSpecCommand("verify myspec");
    expect(result.kind).toBe("verify");
    expect(result.specName).toBe("myspec");
  });

  it("parses apply", () => {
    const result = parseOpenSpecCommand("apply myspec");
    expect(result.kind).toBe("apply");
    expect(result.specName).toBe("myspec");
  });

  it("parses archive", () => {
    const result = parseOpenSpecCommand("archive myspec");
    expect(result.kind).toBe("archive");
    expect(result.specName).toBe("myspec");
  });

  it("parses status", () => {
    const result = parseOpenSpecCommand("status");
    expect(result.kind).toBe("status");
  });

  it("parses list", () => {
    const result = parseOpenSpecCommand("list");
    expect(result.kind).toBe("list");
  });

  it("parses help", () => {
    const result = parseOpenSpecCommand("help");
    expect(result.kind).toBe("help");
  });

  it("returns help for unknown commands", () => {
    const result = parseOpenSpecCommand("foobar");
    expect(result.kind).toBe("help");
  });

  it("parses propose with name only (no description) and empty rest", () => {
    const result = parseOpenSpecCommand("propose");
    expect(result.kind).toBe("help");
  });

  it("parses verify with no spec name", () => {
    const result = parseOpenSpecCommand("verify");
    expect(result.kind).toBe("help");
  });

  it("parses apply with no spec name", () => {
    const result = parseOpenSpecCommand("apply");
    expect(result.kind).toBe("help");
  });

  it("parses archive with no spec name", () => {
    const result = parseOpenSpecCommand("archive");
    expect(result.kind).toBe("help");
  });

  it("case-insensitive command names", () => {
    const r1 = parseOpenSpecCommand("PROPOSE myspec");
    const r2 = parseOpenSpecCommand("Verify myspec");
    const r3 = parseOpenSpecCommand("APPLY myspec");
    expect(r1.kind).toBe("propose");
    expect(r2.kind).toBe("verify");
    expect(r3.kind).toBe("apply");
  });

  it("trims whitespace around command and args", () => {
    const result = parseOpenSpecCommand("  propose   myspec   ");
    expect(result.kind).toBe("propose");
    expect(result.specName).toBe("myspec");
  });

  it("handles multiple spaces between tokens", () => {
    const result = parseOpenSpecCommand("propose   myspec   desc   here");
    expect(result.kind).toBe("propose");
    expect(result.specName).toBe("myspec");
    expect(result.description).toBe("desc here");
  });
});
