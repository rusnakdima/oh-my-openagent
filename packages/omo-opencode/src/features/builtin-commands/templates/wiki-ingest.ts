export const WIKI_INGEST_TEMPLATE = `# /wiki-ingest -- Add Source to Wiki

Add a source (paper, URL, file, transcript) to the wiki at \`.sisyphus/wiki/\`.

**CRITICAL: Never write from memory. Write only what the source supports.**

## Pipeline

### Step 1: Verify wiki exists
Check \`.sisyphus/wiki/index.md\`. If missing, tell user to run \`/wiki-init\` first.

### Step 2: Read SCHEMA.md
Read \`.sisyphus/wiki/SCHEMA.md\` for naming conventions.

### Step 3: Read the source
- File path: use Read tool
- URL: use WebFetch or Read
- Transcript: use provided text

### Step 4: Extract Takeaways
Identify 5-10 most important facts, concepts, or claims. Be specific, no filler.

### Step 5: Confirm with user
Show extracted takeaways and ask:
- Which to emphasize?
- Any specific topics for pages?
- One page or multiple?

Wait for confirmation before writing.

### Step 6: Create wiki page(s)
Create in \`.sisyphus/wiki/pages/{slug}.md\`:
\`\`\`markdown
# {Title}

> Sources: {source path or URL}
> Created: {today}
> Updated: {today}

## Summary
{2-3 sentence summary}

## Key Points
- {takeaway 1}
- {takeaway 2}

## Details
{full content}

## See Also
- [[related-page]]
\`\`\`

### Step 7: Update index.md
Append: \`- [[slug]] -- one-line summary\`. Keep alphabetical.

### Step 8: Backlink audit
Read all existing pages. For each, check if new content is relevant. Add bidirectional \`[[new-slug]]\` links to "See Also" sections.

### Step 9: Update overview.md
Re-read and update the synthesis to include new knowledge. Keep concise.

### Step 10: Append to log.md
Add: \`| {today} | ingest | Added [[slug]] from {source} |\`

### Step 11: Confirm
Show: pages created, backlinks added, overview updates.`
