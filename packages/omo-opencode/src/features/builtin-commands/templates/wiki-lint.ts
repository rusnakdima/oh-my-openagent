export const WIKI_LINT_TEMPLATE = `# /wiki-lint -- Wiki Health Audit

Comprehensive read-only health audit of the wiki at \`.sisyphus/wiki/\`.

This audit is read-only -- it reports issues but does not modify any page except writing the report.

## Pipeline

### Step 1: Verify wiki exists
Check \`.sisyphus/wiki/index.md\`. If missing, stop.

### Step 2: Read everything
Read: SCHEMA.md, index.md, overview.md, and ALL files in pages/.

### Step 3: Check for issues

**Broken Links (ERROR)**
Scan all pages for \`[[link]]\` references. Check for any broken link where the target does not exist in pages/.

**Orphan Pages (WARNING)**
Pages in pages/ not referenced from index.md or any other page. Flag every orphan page found.

**Index Drift (WARNING)**
Pages in pages/ not in index.md, or index entries pointing to missing pages.

**Contradictions (ERROR)**
Compare claims across pages. Flag any contradiction where two pages state conflicting facts.

**Stale Sources (INFO)**
Pages with no "Updated" date or updated more than 30 days ago.

**Coverage Gaps (INFO)**
Topics in overview.md with no dedicated page. Report each coverage gap found.

**Link Density (INFO)**
Pages with zero outgoing [[links]].

### Step 4: Write report
Create \`.sisyphus/wiki/pages/lint-report.md\` with severity tiers.

### Step 5: Offer fixes
For each ERROR/WARNING, offer to fix:
- Broken link targets: remove or create missing page
- Orphan pages: add to index
- Contradictions: show both, ask which is correct

### Step 6: Log
Append to log.md: \`| {today} | lint | {errors} errors, {warnings} warnings |\``
