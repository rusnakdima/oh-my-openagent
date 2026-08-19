import { describe, expect, test } from "bun:test"
import { createAudioRecorder } from "./audio-recorder"

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
})
