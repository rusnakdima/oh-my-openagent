export const WIKI_UPDATE_TEMPLATE = `# /wiki-update -- Revise Wiki Pages

Update existing wiki pages at \`.sisyphus/wiki/\` with new information.

## Pipeline

### Step 1: Verify wiki exists
Check \`.sisyphus/wiki/index.md\`. If missing, stop.

### Step 2: Read SCHEMA.md
Read conventions from \`.sisyphus/wiki/SCHEMA.md\`.

### Step 3: Identify affected pages
Based on the update, read index and find all pages containing old/stale information.

### Step 4: Read affected pages
Read each potentially affected page in full.

### Step 5: Show diffs BEFORE writing
For EACH page needing changes, show the diff:
\`\`\`
## Page: [[slug]]
### Old content:
> {exact text being replaced}
### New content:
> {proposed replacement}
### Reason:
Cite the new source for this change.
\`\`\`

**Wait for user confirmation before making any edits.**

### Step 6: Apply changes
After confirmation:
- Update content
- Bump "updated" date in front-matter
- Add new source to "Sources:" if applicable
- Verify [[links]] still valid

### Step 7: Sweep stale claims
After updating direct pages, scan ALL other pages for the same stale claim. Show user and offer to fix.

### Step 8: Update overview.md
If the change affects high-level synthesis, update overview.md.

### Step 9: Log
Append to log.md: \`| {today} | update | Updated [[page-1]], [[page-2]] -- {reason} |\`

### Step 10: Confirm
Show: pages updated, stale claims swept, sources cited.`
