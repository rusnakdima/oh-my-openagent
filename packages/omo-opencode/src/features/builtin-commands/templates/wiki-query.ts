export const WIKI_QUERY_TEMPLATE = `# /wiki-query -- Query the Wiki

Answer a question using ONLY the structured wiki at \`.sisyphus/wiki/\`.

## CRITICAL RULE
**You must never answer from your own knowledge or memory.** Only cite information found in wiki pages. If the wiki doesn't have the answer, say "not in the wiki" explicitly.

## Pipeline

### Step 1: Verify wiki exists
Check \`.sisyphus/wiki/index.md\`. If missing, tell user to run \`/wiki-init\`.

### Step 2: Read the index
Read \`.sisyphus/wiki/index.md\` to see all available pages.

### Step 3: Identify relevant pages
Based on the question, determine which pages are relevant. Read those pages.

### Step 4: Follow links
If pages reference other pages via \`[[links]]\`, follow them if relevant.

### Step 5: Synthesize answer
Compose answer using ONLY wiki content. Cite every claim by source page:
\`According to [[page-slug]], {fact}.\`

### Step 6: Assess gaps
If partially answerable, clearly state what the wiki covers vs what is "not in the wiki".

### Step 7: Offer to save
If the answer combines multiple sources into new insight, offer:
"This answer combines information from multiple pages. Save as a new page [[suggested-slug]]?"

If yes: create page with citations, update index, run backlink audit, log to log.md.`
