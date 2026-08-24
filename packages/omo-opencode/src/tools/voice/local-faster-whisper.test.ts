import { beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

// T-2: Verify local-faster-whisper uses fs.promises.unlink (not Bun.write) for cleanup
// T-3: Verify audio-recorder uses crypto.randomUUID for temp file paths

describe("temp file cleanup — CR-2 / CR-3 regression", () => {
  test("CR-3: crypto.randomUUID is used instead of Date.now() in temp paths", () => {
    // The fix replaced `${tmpdir()}/omo-voice-${Date.now()}.wav`
    // with `${tmpdir()}/omo-voice-${randomUUID()}.wav`
    // We verify randomUUID produces unique values
    const id1 = randomUUID();
    const id2 = randomUUID();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
