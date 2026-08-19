import { describe, expect, test } from "bun:test"
import { createAudioRecorder } from "./audio-recorder"

describe("audio-recorder", () => {
  describe("createAudioRecorder", () => {
    test("returns AudioRecorder with start and stop methods", () => {
      const recorder = createAudioRecorder({ sample_rate: 16000 })
      expect(typeof recorder.start).toBe("function")
      expect(typeof recorder.stop).toBe("function")
    })

    test("returned recorder interface matches AudioRecorder type", () => {
      const recorder = createAudioRecorder({ sample_rate: 16000 })
      // Should have required AudioRecorder interface fields
      expect(recorder).toHaveProperty("start")
      expect(recorder).toHaveProperty("stop")
    })

    test("accepts sample_rate config option", () => {
      const recorder = createAudioRecorder({ sample_rate: 48000 })
      expect(recorder).toBeDefined()
    })
  })
})
