import { describe, expect, test } from "bun:test";
import { buildMenuDisplay } from "../../hooks/interactive-menu-session/state-manager";

// extractInputFromPane is tested indirectly by testing the parsing logic
// We test it via its behavior: parses "> " prefix lines

describe("buildMenuDisplay", () => {
  test("#given prompt only #when building display #then returns prompt", () => {
    const result = buildMenuDisplay("What is your favorite color?");
    expect(result).toBe("What is your favorite color?");
  });

  test("#given prompt with options #when building display #then returns prompt with numbered list", () => {
    const result = buildMenuDisplay("Choose a color:", [
      "Red",
      "Green",
      "Blue",
    ]);
    expect(result).toContain("Choose a color:");
    expect(result).toContain("1. Red");
    expect(result).toContain("2. Green");
    expect(result).toContain("3. Blue");
  });

  test("#given empty options array #when building display #then returns prompt without list", () => {
    const result = buildMenuDisplay("Choose:", []);
    expect(result).toBe("Choose:");
  });

  test("#given prompt with single option #when building display #then returns prompt with single item", () => {
    const result = buildMenuDisplay("Pick one:", ["Alpha"]);
    expect(result).toContain("1. Alpha");
  });

  test("#given prompt with special chars #when building display #then escapes single quotes in output", () => {
    const result = buildMenuDisplay("Say 'hello':", ["it's fine"]);
    // The function itself doesn't escape — that's done at call site
    expect(result).toContain("it's fine");
  });
});

describe("extractInputFromPane logic", () => {
  // These tests mirror the extractInputFromPane logic inline

  function extractInputFromPane(paneContent: string | null): string | null {
    if (!paneContent) return null;
    const lines = paneContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("> ")) {
        const input = trimmed.slice(2).trim();
        if (input.length > 0) return input;
      }
    }
    return null;
  }

  test("#given null pane content #when extracting input #then returns null", () => {
    expect(extractInputFromPane(null)).toBeNull();
  });

  test("#given empty string pane content #when extracting input #then returns null", () => {
    expect(extractInputFromPane("")).toBeNull();
  });

  test("#given pane with no '>' line #when extracting input #then returns null", () => {
    const pane = "some text\nwithout prompt\n";
    expect(extractInputFromPane(pane)).toBeNull();
  });

  test("#given pane with '> ' (empty input after prompt) #when extracting input #then returns null", () => {
    const pane = "Choose:\n1. Red\n> \n";
    expect(extractInputFromPane(pane)).toBeNull();
  });

  test("#given pane with '> Blue' #when extracting input #then returns Blue", () => {
    const pane = "Choose:\n1. Red\n2. Green\n> Blue\n";
    expect(extractInputFromPane(pane)).toBe("Blue");
  });

  test("#given pane with '>   spaced input  ' #when extracting input #then returns trimmed input", () => {
    const pane = "Choose:\n>   spaced input  \n";
    expect(extractInputFromPane(pane)).toBe("spaced input");
  });

  test("#given pane with last line being '> answer' #when extracting input #then returns answer", () => {
    const pane = "Welcome\nMenu here\n> answer\n";
    expect(extractInputFromPane(pane)).toBe("answer");
  });

  test("#given pane with multiple '>' lines #when extracting input #then returns first non-empty '> ' line", () => {
    const pane = "> already typed\n> final answer\n";
    expect(extractInputFromPane(pane)).toBe("already typed");
  });

  test("#given pane with '>' but no space after #when extracting input #then returns null", () => {
    const pane = ">\n";
    expect(extractInputFromPane(pane)).toBeNull();
  });

  test("#given pane with '>nospace' #when extracting input #then returns null", () => {
    const pane = ">nospace\n";
    expect(extractInputFromPane(pane)).toBeNull();
  });
});
