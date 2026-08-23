import { describe, expect, test } from "bun:test";
import { createLocalTTSProvider } from "./local-tts";

describe("local-tts M-1: edge-tts backend validation", () => {
  test("edge-tts backend creates provider with correct interface (M-1)", () => {
    const provider = createLocalTTSProvider({
      backend: "edge-tts",
      voice: "en-US-AriaNeural",
    });

    expect(provider.name).toBe("local-tts");
    expect(typeof provider.speak).toBe("function");
  });

  test("validateConfig returns boolean for say backend", () => {
    const provider = createLocalTTSProvider({ backend: "say", voice: "Ava" });
    const result = provider.validateConfig();
    expect(typeof result.valid).toBe("boolean");
  });

  test("validateConfig returns boolean for espeak backend", () => {
    const provider = createLocalTTSProvider({
      backend: "espeak",
      voice: "english",
    });
    const result = provider.validateConfig();
    expect(typeof result.valid).toBe("boolean");
  });
});
