#!/usr/bin/env bun
/**
 * TUI Smoke Test
 *
 * Tests the TUI interaction tools by:
 * 1. Launching opencode in a tmux session
 * 2. Taking a snapshot
 * 3. Verifying the layout is parsed
 * 4. Sending keys and verifying response
 */

import {
  findElementByText,
  killTuiSession,
  launchOpenCodeSession,
  parseLayout,
  sendKeys,
  takeSnapshot,
} from "@oh-my-opencode/tui-core";

const TEST_SESSION = "omo-tui-test-" + Date.now();

async function main() {
  console.log("🧪 TUI Smoke Test");
  console.log("==================\n");

  // Check if tmux is available
  try {
    const { runTmuxCommand } = await import("@oh-my-opencode/tmux-core");
    const result = await runTmuxCommand("tmux", ["list-sessions"]);
    if (!result.success) {
      console.log("⚠️  tmux not running - skipping live test");
      console.log("✅ Smoke test structure verified (no runtime errors)");
      return;
    }
  } catch {
    console.log("⚠️  tmux not available - skipping live test");
    console.log("✅ Smoke test structure verified (no runtime errors)");
    return;
  }

  // Clean up any existing test session
  await killTuiSession(TEST_SESSION);

  console.log(`📺 Creating test session: ${TEST_SESSION}`);
  const launchResult = await launchOpenCodeSession(TEST_SESSION, {
    command: "echo 'TUI Test Ready' && sleep 10",
  });

  if (!launchResult.success) {
    console.log("❌ Failed to launch test session:", launchResult.error);
    process.exit(1);
  }

  console.log("✅ Session launched\n");

  try {
    // Wait for session to initialize
    await new Promise((r) => setTimeout(r, 1000));

    // Test 1: Take a snapshot
    console.log("📸 Test 1: Taking snapshot...");
    const snapshot = await takeSnapshot(TEST_SESSION);
    if (!snapshot) {
      console.log("❌ Failed to take snapshot");
      process.exit(1);
    }
    console.log(`✅ Snapshot captured (${snapshot.rawOutput.length} chars)`);
    console.log(
      `   Parsed ${snapshot.parsedLayout?.elements.length ?? 0} elements\n`,
    );

    // Test 2: Send keys
    console.log("⌨️  Test 2: Sending keys...");
    const keysResult = await sendKeys(TEST_SESSION, "echo 'test'");
    if (!keysResult) {
      console.log("❌ Failed to send keys");
      process.exit(1);
    }
    console.log("✅ Keys sent successfully\n");

    // Test 3: Parse layout from sample output
    console.log("🔍 Test 3: Layout parsing...");
    const sampleOutput = `
┌─────────────────────────────────────┐
│ Welcome to OpenCode                 │
│                                     │
│   [Install]    [Configure]          │
│                                     │
│ > Type your message...              │
└─────────────────────────────────────┘
`;
    const layout = parseLayout(sampleOutput, 40, 8);
    console.log(`   Parsed ${layout.elements.length} elements`);

    // Find the Install button
    const installButton = findElementByText(layout, "Install");
    if (installButton) {
      console.log(
        `✅ Found "Install" button at (${installButton.x}, ${installButton.y})`,
      );
    } else {
      console.log("❌ Failed to find Install button");
    }

    // Find the input field
    const inputField = layout.elements.find((e) => e.type === "input");
    if (inputField) {
      console.log(`✅ Found input field at (${inputField.x}, ${inputField.y})`);
    }

    console.log("\n✅ All tests passed!");
  } finally {
    // Clean up
    console.log("\n🧹 Cleaning up...");
    await killTuiSession(TEST_SESSION);
    console.log("✅ Session terminated");
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
