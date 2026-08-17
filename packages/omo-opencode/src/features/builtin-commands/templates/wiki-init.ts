export const WIKI_INIT_TEMPLATE = `# /wiki-init -- Bootstrap LLM Wiki

Bootstrap a new structured wiki based on Karpathy's LLM Wiki pattern at \`.sisyphus/wiki/\`.

**Important:** If \`.sisyphus/wiki/\` already exists, warn the user and ask for confirmation before overwriting.

## Task

Create the wiki directory structure:

- .sisyphus/wiki/SCHEMA.md
- .sisyphus/wiki/index.md
- .sisyphus/wiki/log.md
- .sisyphus/wiki/overview.md
- .sisyphus/wiki/pages/.gitkeep

### SCHEMA.md
Document conventions:
- Wiki root path: \`.sisyphus/wiki/\`
- Page naming: lowercase slugs with hyphens (e.g., \`api-authentication.md\`)
- Link format: \`[[page-slug]]\` for internal wiki links
- Source citation: \`[source: filename or URL]\`
- front-matter: \`# Title\`, \`> Sources: ...\`, \`> Created: date\`, \`> Updated: date\`, \`> Backlinks: ...\`
- Index format: one line per page -- \`- [[slug]] -- one-line summary\`
- All sources must be cited. No claims from memory.
- The backlinks section lists all pages linking to this page.

### index.md
\`\`\`markdown
# Wiki Index

*No pages yet. Use /wiki-ingest to add sources.*
\`\`\`

### log.md
\`\`\`markdown
# Wiki Log

| Date | Operation | Details |
|------|-----------|---------|
| {today} | init | Wiki bootstrapped |
\`\`\`

### overview.md
\`\`\`markdown
# Wiki Overview

*This overview will be automatically updated as pages are added.*
\`\`\`

### pages/.gitkeep
Create empty file to ensure directory exists.

After creating all files, confirm what was created and suggest: "Use /wiki-ingest to add your first source."`
