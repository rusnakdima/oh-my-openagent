import * as childProcess from "node:child_process"

export interface AudioToolStatus {
  tool: string
  available: boolean
  version?: string
}

function execFilePromise(
  command: string,
  args: string[],
  timeoutMs = 5000,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = childProcess.execFile(command, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({ success: err == null, stdout: stdout ?? "", stderr: stderr ?? "" })
    })
    // Enforce timeout from the JS side too
    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        // ignore if already exited
      }
      resolve({ success: false, stdout: "", stderr: "timeout" })
    }, timeoutMs + 500)
    proc.on("close", () => clearTimeout(timer))
  })
}

export async function detectAvailableAudioTools(): Promise<AudioToolStatus[]> {
  // Check all three tools in parallel for speed
  const [soxCheck, arecordCheck, ffmpegCheck] = await Promise.all([
    execFilePromise("which", ["sox"]).then(async (r) => {
      if (!r.success) return { tool: "sox", available: false }
      const versionResult = await execFilePromise("sox", ["--version"])
      return {
        tool: "sox",
        available: true,
        version: versionResult.stdout.trim().split("\n")[0] ?? undefined,
      }
    }),
    execFilePromise("which", ["arecord"]).then((r) => ({
      tool: "arecord",
      available: r.success,
    })),
    execFilePromise("which", ["ffmpeg"]).then(async (r) => {
      if (!r.success) return { tool: "ffmpeg", available: false }
      const versionResult = await execFilePromise("ffmpeg", ["-version"])
      return {
        tool: "ffmpeg",
        available: true,
        version: versionResult.stdout.split("\n")[0] ?? undefined,
      }
    }),
  ])

  return [soxCheck, arecordCheck, ffmpegCheck]
}

/** Cached result — tool paths don't change at runtime. Cached on first call. */
let _cachedTool: string | null | "unknown" = "unknown"

export function getPreferredRecorderTool(): string | null {
  if (_cachedTool !== "unknown") return _cachedTool

  // Fallback sync check using which/where — still fast since it's a single lookup
  // Priority: sox > arecord > ffmpeg
  const check = (cmd: string, args: string[]) => {
    try {
      const r = childProcess.execFileSync(cmd, args, { timeout: 3000, stdio: ["pipe", "pipe", "pipe"] })
      return r.toString().trim().length > 0
    } catch {
      return false
    }
  }

  if (process.platform === "win32") {
    if (check("where", ["sox.exe"])) return (_cachedTool = "sox")
  } else {
    if (check("which", ["sox"])) return (_cachedTool = "sox")
    if (process.platform === "linux" && check("which", ["arecord"])) return (_cachedTool = "arecord")
  }
  if (check("which", ["ffmpeg"])) return (_cachedTool = "ffmpeg")
  return (_cachedTool = null)
}

