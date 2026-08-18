import * as childProcess from "node:child_process"

export interface AudioToolStatus {
  tool: string
  available: boolean
  version?: string
}

function execSync(command: string, args: string[]): { success: boolean; stdout: string; stderr: string } {
  try {
    const stdout = childProcess.execFileSync(command, args, {
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    })
    return { success: true, stdout: stdout.toString(), stderr: "" }
  } catch (err) {
    const error = err as { stderr?: Buffer }
    return {
      success: false,
      stdout: "",
      stderr: error.stderr?.toString() ?? "",
    }
  }
}

export async function detectAvailableAudioTools(): Promise<AudioToolStatus[]> {
  const results: AudioToolStatus[] = []

  // Check sox (preferred - cross-platform, consistent format)
  const soxResult = execSync("which", ["sox"])
  if (soxResult.success) {
    const versionResult = execSync("sox", ["--version"])
    results.push({
      tool: "sox",
      available: true,
      version: versionResult.stdout.trim().split("\n")[0] ?? undefined,
    })
  } else {
    results.push({ tool: "sox", available: false })
  }

  // Check arecord (Linux alsa-utils)
  const arecordResult = execSync("which", ["arecord"])
  if (arecordResult.success) {
    results.push({ tool: "arecord", available: true })
  } else {
    results.push({ tool: "arecord", available: false })
  }

  // Check ffmpeg (last resort)
  const ffmpegResult = execSync("which", ["ffmpeg"])
  if (ffmpegResult.success) {
    const versionResult = execSync("ffmpeg", ["-version"])
    results.push({
      tool: "ffmpeg",
      available: true,
      version: versionResult.stdout.split("\n")[0] ?? undefined,
    })
  } else {
    results.push({ tool: "ffmpeg", available: false })
  }

  return results
}

export function getPreferredRecorderTool(): string | null {
  // Priority: sox > arecord > ffmpeg
  if (process.platform === "win32") {
    // On Windows prefer sox via Git Bash
    const soxResult = execSync("where", ["sox.exe"])
    if (soxResult.success) return "sox"
  } else {
    const soxResult = execSync("which", ["sox"])
    if (soxResult.success) return "sox"
    if (process.platform === "linux") {
      const arecordResult = execSync("which", ["arecord"])
      if (arecordResult.success) return "arecord"
    }
  }
  const ffmpegResult = execSync("which", ["ffmpeg"])
  if (ffmpegResult.success) return "ffmpeg"
  return null
}
