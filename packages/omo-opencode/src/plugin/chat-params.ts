import { isRecord } from "@oh-my-opencode/utils"
import { getSessionPromptParams } from "../shared/session-prompt-params-state"
import { getModelCapabilities, log, resolveCompatibleModelSettings } from "../shared"
import { setSelectedGlobalModel } from "../shared/session-model-state"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

// Track last model per session to detect changes (deduplicate LLM calls)
// Subagent sessionIDs also write globalTuiModel — map includes ALL sessions (primary + subagent), not just primary.
const lastChatParamsModel = new Map<string, { providerID: string; modelID: string }>()
let lastGlobalChatParamsModel: { providerID: string; modelID: string } | null = null

const HOME = process.env.HOME ?? ""
const OPENCODE_CONFIG = path.join(HOME, ".config/opencode/opencode.jsonc")
const MIMOCODE_CONFIG = path.join(HOME, ".config/mimocode/mimocode.jsonc")

function updateConfigModel(configPath: string, model: string): void {
  try {
    const raw = readFileSync(configPath, "utf-8")
    const stripped = raw.replace(/\/\/.*$/gm, "")
    const cfg = JSON.parse(stripped)
    cfg.model = model
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8")
  } catch {
    // Non-fatal — config file may not exist or be writable
  }
}

const SAFE_MAX_OUTPUT_TOKENS_FALLBACK = 4096

export type ChatParamsInput = {
  sessionID: string
  agent: { name?: string }
  model: { providerID: string; modelID: string }
  provider: { id: string }
  message: { variant?: string }
}

type ChatParamsHookInput = ChatParamsInput & {
  rawMessage?: Record<string, unknown>
}

export type ChatParamsOutput = {
  temperature?: number
  topP?: number
  topK?: number
  maxOutputTokens?: number
  options: Record<string, unknown>
}



function buildChatParamsInput(raw: unknown): ChatParamsHookInput | null {
  if (!isRecord(raw)) return null

  const sessionID = raw.sessionID
  const agent = raw.agent
  const model = raw.model
  const provider = raw.provider
  const message = raw.message

  if (typeof sessionID !== "string") return null
  if (!isRecord(model)) return null
  if (!isRecord(provider)) return null
  if (!isRecord(message)) return null

  let agentName: string | undefined
  if (typeof agent === "string") {
    agentName = agent
  } else if (isRecord(agent)) {
    const name = agent.name
    if (typeof name === "string") {
      agentName = name
    }
  }
  if (!agentName) return null

  const providerID = model.providerID
  const modelID = typeof model.modelID === "string"
    ? model.modelID
    : typeof model.id === "string"
      ? model.id
      : undefined
  const providerId = provider.id
  if (typeof providerID !== "string") return null
  if (typeof modelID !== "string") return null
  if (typeof providerId !== "string") return null

  return {
    sessionID,
    agent: { name: agentName },
    model: { providerID, modelID },
    provider: { id: providerId },
    message,
    rawMessage: message,
  }
}

function isChatParamsOutput(raw: unknown): raw is ChatParamsOutput {
  if (!isRecord(raw)) return false
  if (!isRecord(raw.options)) {
    raw.options = {}
  }
  return isRecord(raw.options)
}

export function createChatParamsHandler(_args: {
  client?: unknown
} = {}): (input: unknown, output: unknown) => Promise<void> {
  return async (input, output): Promise<void> => {
    const normalizedInput = buildChatParamsInput(input)
    if (!normalizedInput) return
    if (!isChatParamsOutput(output)) return

    const storedPromptParams = getSessionPromptParams(normalizedInput.sessionID)
    if (storedPromptParams) {
      if (storedPromptParams.temperature !== undefined) {
        output.temperature = storedPromptParams.temperature
      }
      if (storedPromptParams.topP !== undefined) {
        output.topP = storedPromptParams.topP
      }
      if (
        typeof storedPromptParams.maxOutputTokens === "number" &&
        storedPromptParams.maxOutputTokens > 0
      ) {
        (output as Record<string, unknown>).maxOutputTokens = storedPromptParams.maxOutputTokens
      }
      if (storedPromptParams.options) {
        output.options = {
          ...output.options,
          ...storedPromptParams.options,
        }
      }
    }

    const capabilities = getModelCapabilities({
      providerID: normalizedInput.model.providerID,
      modelID: normalizedInput.model.modelID,
    })

    // Capture model on every LLM call — fires reliably when user selects via /models
    // Global TUI model applies to ALL modes (primary|subagent|all); subagent sessionIDs also write.
    const parsed = {
      providerID: normalizedInput.model.providerID,
      modelID: normalizedInput.model.modelID,
    }
    const lastPerSession = lastChatParamsModel.get(normalizedInput.sessionID)
    const lastGlobal = lastGlobalChatParamsModel
    const isPerSessionChanged = !lastPerSession || lastPerSession.providerID !== parsed.providerID || lastPerSession.modelID !== parsed.modelID
    const isGlobalChanged = !lastGlobal || lastGlobal.providerID !== parsed.providerID || lastGlobal.modelID !== parsed.modelID
    if (isPerSessionChanged || isGlobalChanged) {
      setSelectedGlobalModel(parsed)
      lastChatParamsModel.set(normalizedInput.sessionID, parsed)
      lastGlobalChatParamsModel = parsed
      log("[chat-params] model captured", { model: parsed, sessionID: normalizedInput.sessionID.slice(0, 8) })
      // Sync to config files so MiMoCode sidebar and OpenCode config stay in sync
      const fullModel = `${parsed.providerID}/${parsed.modelID}`
      updateConfigModel(OPENCODE_CONFIG, fullModel)
      updateConfigModel(MIMOCODE_CONFIG, fullModel)
    }

    const compatibility = resolveCompatibleModelSettings({
      providerID: normalizedInput.model.providerID,
      modelID: normalizedInput.model.modelID,
      desired: {
        variant: typeof normalizedInput.message.variant === "string"
          ? normalizedInput.message.variant
          : undefined,
        reasoningEffort: typeof output.options.reasoningEffort === "string"
          ? output.options.reasoningEffort
          : undefined,
        temperature: typeof output.temperature === "number" ? output.temperature : undefined,
        topP: typeof output.topP === "number" ? output.topP : undefined,
        maxTokens: typeof output.maxOutputTokens === "number" ? output.maxOutputTokens : undefined,
        thinking: isRecord(output.options.thinking) ? output.options.thinking : undefined,
      },
      capabilities,
    })

    if (normalizedInput.rawMessage) {
      if (compatibility.variant !== undefined) {
        normalizedInput.rawMessage.variant = compatibility.variant
      } else {
        delete normalizedInput.rawMessage.variant
      }
    }
    normalizedInput.message = normalizedInput.rawMessage as { variant?: string }

    if (compatibility.reasoningEffort !== undefined) {
      output.options.reasoningEffort = compatibility.reasoningEffort
    } else if ("reasoningEffort" in output.options) {
      delete output.options.reasoningEffort
    }

    if ("temperature" in compatibility) {
      if (compatibility.temperature !== undefined) {
        output.temperature = compatibility.temperature
      } else {
        delete output.temperature
      }
    }

    if ("topP" in compatibility) {
      if (compatibility.topP !== undefined) {
        output.topP = compatibility.topP
      } else {
        delete output.topP
      }
    }

    if ("maxTokens" in compatibility) {
      if (compatibility.maxTokens !== undefined && compatibility.maxTokens > 0) {
        output.maxOutputTokens = compatibility.maxTokens
      } else {
        const originalMaxOutputTokens = typeof output.maxOutputTokens === "number"
          ? output.maxOutputTokens
          : compatibility.maxTokens
        output.maxOutputTokens = SAFE_MAX_OUTPUT_TOKENS_FALLBACK
        if (typeof originalMaxOutputTokens === "number" && originalMaxOutputTokens <= 0) {
          log(
            `[plugin] maxOutputTokens=${originalMaxOutputTokens} is non-positive; using safe fallback ${SAFE_MAX_OUTPUT_TOKENS_FALLBACK}`,
          )
        }
      }
    }

    if ("thinking" in compatibility) {
      if (compatibility.thinking !== undefined) {
        output.options.thinking = compatibility.thinking
      } else {
        delete output.options.thinking
      }
    }
  }
}
