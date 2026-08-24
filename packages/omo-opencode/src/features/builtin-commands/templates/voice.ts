export const VOICE_TEMPLATE =
  `You are activating voice input — capture microphone audio and transcribe it to text.

## How Voice Input Works

1. Call the \`voice\` tool to capture microphone audio
2. Recording starts automatically when the tool is called
3. Recording stops on silence (amplitude below threshold) or max duration
4. Audio is transcribed using the configured STT backend
5. Transcribed text is injected as your next user message automatically

## Voice Tool Usage

\`\`\`
voice(backend?: "openai" | "cloudflare" | "local")
\`\`\`

- \`backend\`: STT provider. Defaults to \`"openai"\` (OpenAI Whisper API).
  - \`"openai"\` — OpenAI Whisper API (requires \`OPENAI_API_KEY\` env var)
  - \`"cloudflare"\` — Cloudflare Workers AI Deepgram (requires \`CF_API_TOKEN\` env var)
  - \`"local"\` — Local faster-whisper (requires \`faster-whisper-cli\` Python package)

First time: call \`voice(record: false)\` to check microphone availability.
Then call \`voice()\` or \`voice(backend: "openai")\` to start recording.

## Requirements

- \`voice.enabled: true\` must be set in your oh-my-openagent config
- Required env var for your chosen backend:
  - OpenAI: \`OPENAI_API_KEY\`
  - Cloudflare: \`CF_API_TOKEN\` (Cloudflare API token with Workers AI access)`;
