export const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
export const INLINE_CODE_PATTERN = /`[^`]+`/g;

import type { KeywordType } from "../../config/schema/keyword-detector";
import {
  getUltraworkMessage,
  isNonOmoAgent,
  isPlannerAgent,
} from "./ultrawork";
import { TEAM_MESSAGE, TEAM_PATTERN } from "./team";
import { HYPERPLAN_MESSAGE, HYPERPLAN_PATTERN } from "./hyperplan";
import { OPENSPEC_MESSAGE, OPENSPEC_PATTERN } from "./openspec";

export { getUltraworkMessage, isNonOmoAgent, isPlannerAgent };
export { TEAM_MESSAGE, TEAM_PATTERN };
export { HYPERPLAN_MESSAGE, HYPERPLAN_PATTERN };
export { OPENSPEC_MESSAGE, OPENSPEC_PATTERN };

// Search keyword
export const SEARCH_PATTERN = /\b(search for|find|lookup|look up|search)\b/i;
export const SEARCH_MESSAGE = `[search-mode]
You are in SEARCH mode. The user wants you to find, research, or look up information.
- Use web search tools to find relevant information
- Be thorough and exhaustive in searching
- Cite sources clearly
- Present findings in an organized, scannable format
`;

// Analyze keyword
export const ANALYZE_PATTERN =
  /\b(analyze|analysis|examine|investigate|assess|evaluate)\b/i;
export const ANALYZE_MESSAGE = `[analyze-mode]
You are in ANALYZE mode. The user wants a deep analytical examination.
- Break down the problem or subject systematically
- Identify patterns, relationships, and root causes
- Consider multiple perspectives and trade-offs
- Support conclusions with evidence and reasoning
`;

// Refactor keyword
export const REFACTOR_PATTERN =
  /\b(refactor|restructure|reorganize|improve|rethink)\b/i;
export const REFACTOR_MESSAGE = `[refactor-mode]
You are in REFACTOR mode. The user wants to improve code quality and structure.
- Preserve existing behavior while improving internal quality
- Follow SOLID principles and clean code practices
- Make incremental, verifiable changes
- Keep refactorings small and focused — one concern per change
`;

// Test keyword
export const TEST_PATTERN =
  /\b(test|testing|tests|unittest|pytest|test suite)\b/i;
export const TEST_MESSAGE = `[test-mode]
You are in TEST mode. The user wants you to write or improve tests.
- Write tests before or alongside implementation
- Cover happy paths, edge cases, and error conditions
- Follow the existing test conventions in the project
- Ensure tests are deterministic and isolated
`;

// Fix keyword
export const FIX_PATTERN = /\b(fix|bug|repair|patch|resolve|debug)\b/i;
export const FIX_MESSAGE = `[fix-mode]
You are in FIX mode. The user wants you to fix a bug or resolve an issue.
- Reproduce the bug before fixing it
- Identify the root cause — do not treat symptoms
- Make the smallest fix that resolves the issue
- Add a regression test to prevent recurrence
`;

// Review keyword
export const REVIEW_PATTERN = /\b(review|critique|peer review)\b/i;
export const REVIEW_MESSAGE = `[review-mode]
You are in REVIEW mode. The user wants a thorough review.
- Review the code, design, or implementation critically
- Identify issues, risks, and areas for improvement
- Be specific and constructive in feedback
- Distinguish must-fix issues from nice-to-have suggestions
`;

// Hyperplan-ultrawork combo: strict adjacency, both word orders
export const HYPERPLAN_ULTRAWORK_PATTERN =
  /\b(?:hpp|hyperplan)\s+(?:ulw|ultrawork)\b|\b(?:ulw|ultrawork)\s+(?:hpp|hyperplan)\b/i;

const HYPERPLAN_ULTRAWORK_BANNER = `<hyperplan-ultrawork-mode>
**MANDATORY**: Say "HYPERPLAN ULTRAWORK MODE ENABLED!" exactly once as your first response. Do NOT say the standalone "ULTRAWORK MODE ENABLED!" or "HYPERPLAN MODE ENABLED!" banners.

Apply the ultrawork protocol below as your execution framework. You MUST ALSO load the hyperplan skill immediately via \`skill(name="hyperplan")\` and follow its full adversarial workflow — do NOT improvise, do NOT skip rounds, do NOT write the plan yourself.
</hyperplan-ultrawork-mode>`;

export function getHyperplanUltraworkMessage(
  agentName?: string,
  modelID?: string,
): string {
  return `${HYPERPLAN_ULTRAWORK_BANNER}\n\n${
    getUltraworkMessage(agentName, modelID)
  }`;
}

export type KeywordDetector = {
  type: KeywordType;
  pattern: RegExp;
  message: string | ((agentName?: string, modelID?: string) => string);
};

export const KEYWORD_DETECTORS: KeywordDetector[] = [
  {
    type: "ultrawork",
    pattern: /\b(ultrawork|ulw)\b/i,
    message: getUltraworkMessage,
  },
  {
    type: "team",
    pattern: TEAM_PATTERN,
    message: TEAM_MESSAGE,
  },
  {
    type: "hyperplan",
    pattern: HYPERPLAN_PATTERN,
    message: HYPERPLAN_MESSAGE,
  },
  {
    type: "hyperplan-ultrawork",
    pattern: HYPERPLAN_ULTRAWORK_PATTERN,
    message: getHyperplanUltraworkMessage,
  },
  {
    type: "openspec",
    pattern: OPENSPEC_PATTERN,
    message: OPENSPEC_MESSAGE,
  },
  {
    type: "search",
    pattern: SEARCH_PATTERN,
    message: SEARCH_MESSAGE,
  },
  {
    type: "analyze",
    pattern: ANALYZE_PATTERN,
    message: ANALYZE_MESSAGE,
  },
  {
    type: "refactor",
    pattern: REFACTOR_PATTERN,
    message: REFACTOR_MESSAGE,
  },
  {
    type: "test",
    pattern: TEST_PATTERN,
    message: TEST_MESSAGE,
  },
  {
    type: "fix",
    pattern: FIX_PATTERN,
    message: FIX_MESSAGE,
  },
  {
    type: "review",
    pattern: REVIEW_PATTERN,
    message: REVIEW_MESSAGE,
  },
];
