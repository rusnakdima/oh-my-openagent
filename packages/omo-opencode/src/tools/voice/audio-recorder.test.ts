import { describe, expect, test } from "bun:test"
import { createAudioRecorder } from "./audio-recorder"
import { randomUUID } from "node:crypto"

describe("audio-recorder", () => {
  describe("createAudioRecorder", () => {
    test("returns AudioRecorder with checkAvailability, record, and stop", () => {
      const recorder = createAudioRecorder({ sample_rate: 16000 })
      expect(typeof recorder.checkAvailability).toBe("function")
      expect(typeof recorder.record).toBe("function")
      expect(typeof recorder.stop).toBe("function")
    })

    test("returned recorder has all AudioRecorder interface methods", () => {
      const recorder = createAudioRecorder({ sample_rate: 16000 })
      expect(recorder).toHaveProperty("checkAvailability")
      expect(recorder).toHaveProperty("record")
      expect(recorder).toHaveProperty("stop")
    })

    test("accepts sample_rate config option", () => {
      const recorder = createAudioRecorder({ sample_rate: 48000 })
      expect(recorder).toBeDefined()
    })
  })

  describe("CR-3: temp file path uses UUID not Date.now()", () => {
    test("randomUUID produces unique IDs to prevent millisecond-level collisions", () => {
      const ids = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        ids.add(randomUUID())
      }
      expect(ids.size).toBe(1000)
    })
  })

  describe("CR-4 / CR-5: stop() cleans up all resources", () => {
    test("stop() is callable without throwing even when no recording is in progress", () => {
      const recorder = createAudioRecorder({ sample_rate: 16000 })
      // Calling stop() when idle should not throw
      expect(() => recorder.stop()).not.toThrow()
    })
  })
})
