import { afterEach, describe, expect, test } from "bun:test";
import { createRuntimeSkillSourceServer } from "./source-server";
import { selectRuntimeSecuritySkills } from "./runtime-skill-config";

let cleanupServer: { readonly stop: () => void } | undefined;

afterEach(() => {
  cleanupServer?.stop();
  cleanupServer = undefined;
});

describe("runtime security skill source server", () => {
  test("serves an OpenCode skill index and markdown files with matching frontmatter names", async () => {
    // given
    const source = await createRuntimeSkillSourceServer({
      skills: selectRuntimeSecuritySkills(),
    });
    cleanupServer = source;

    // when
    const indexResponse = await source.fetch(
      new Request(new URL("index.json", source.url)),
    );
    const index = await indexResponse.json();
    const researchResponse = await source.fetch(
      new Request(new URL("security-research/SKILL.md", source.url)),
    );
    const researchMarkdown = await researchResponse.text();

    // then
    expect(indexResponse.status).toBe(200);
    expect(index).toEqual({
      skills: [
        { name: "security-research", files: ["SKILL.md"] },
      ],
    });
    expect(researchResponse.status).toBe(200);
    expect(researchMarkdown).toContain(
      "Security Research - Team Mode Vulnerability Audit",
    );
  });

  test("returns 404 for unknown paths", async () => {
    // given
    const source = await createRuntimeSkillSourceServer({
      skills: selectRuntimeSecuritySkills(),
    });
    cleanupServer = source;

    // when
    const response = await source.fetch(
      new Request(new URL("missing/SKILL.md", source.url)),
    );

    // then
    expect(response.status).toBe(404);
  });

  test("falls back to a Node HTTP server when Bun.serve is unavailable", async () => {
    // given
    const source = await createRuntimeSkillSourceServer(
      {
        skills: selectRuntimeSecuritySkills(),
      },
      {},
    );
    cleanupServer = source;

    // when
    const indexResponse = await source.fetch(
      new Request(new URL("index.json", source.url)),
    );
    const index = await indexResponse.json();

    // then
    expect(source.url).toStartWith("http://127.0.0.1:");
    expect(indexResponse.status).toBe(200);
    expect(index).toEqual({
      skills: [
        { name: "security-research", files: ["SKILL.md"] },
      ],
    });
  });
});
