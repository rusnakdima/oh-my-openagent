import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { log } from "../../../shared";
import type { TTSProvider } from "./types";

interface OpenAITTSTConfig {
  model: "gpt-4o-mini-tts" | "tts-1" | "tts-1-hd";
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  format: "mp3" | "opus" | "aac" | "flac";
  speed: number;
}

export function createOpenAITTSProvider(config: OpenAITTSTConfig): TTSProvider {
  return {
    name: "openai-tts",
    validateConfig() {
      const apiKey = process.env["OPENAI_API_KEY"];
      if (!apiKey) {
        return {
          valid: false,
          error:
            "OpenAI API key not found. Set OPENAI_API_KEY environment variable.",
        };
      }
      return { valid: true };
    },
    async speak(text: string): Promise<void> {
      const apiKey = process.env["OPENAI_API_KEY"];
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY not set");
      }

      const body = {
        model: config.model,
        input: text,
        voice: config.voice,
        response_format: config.format,
        speed: config.speed,
      };

      log(`[voice] TTS via OpenAI (${config.model}, voice=${config.voice})`);

      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `OpenAI TTS API error ${response.status}: ${errorText}`,
        );
      }

      if (!response.body) {
        throw new Error("OpenAI TTS returned empty response body");
      }

      // Stream audio to a temp file and play it
      const outputPath = `${tmpdir()}/omo-tts-${randomUUID()}.${config.format}`;
      const fileStream = fs.createWriteStream(outputPath);

      const reader = response.body.getReader();
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fileStream.write(value);
        }
        fileStream.end();
      } finally {
        reader.releaseLock();
      }

      // Wait for the stream to be fully flushed to disk before playing
      await new Promise<void>((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });

      // Play the audio file — always clean up temp file regardless of outcome
      try {
        await playAudioFile(outputPath);
      } finally {
        await fs.promises.unlink(outputPath).catch(() => {
          // ignore cleanup errors
        });
      }
    },
  };
}

async function playAudioFile(filePath: string): Promise<void> {
  const platform = process.platform;
  const player = platform === "win32"
    ? "powershell"
    : platform === "darwin"
    ? "afplay"
    : "aplay";
  const args = platform === "win32"
    ? [
      "-c",
      `Add-Type -AssemblyName System.Media; [System.Media.SoundPlayer]::new("${
        filePath.replace(/\\/g, "\\\\")
      }").PlaySync()`,
    ]
    : platform === "darwin"
    ? [filePath]
    : [filePath];

  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn(player, args, { stdio: "ignore" });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Audio playback exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}
