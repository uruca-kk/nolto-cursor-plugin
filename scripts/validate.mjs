#!/usr/bin/env node
// validate.mjs — Nolto Cursor plugin validator.
// Node built-ins only. Run: node cursor-plugin/scripts/validate.mjs (any cwd)
// Exit 0: all checks pass. Exit 1: one error line per failure (file + reason).

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";

// Flat layout: cursor-plugin/ is both the plugin root and the public repo root.
// SCRIPTS_DIR = cursor-plugin/scripts/
// PLUGIN_ROOT  = cursor-plugin/   (all plugin files live here)
// REPO_ROOT    = monorepo root    (canonical enum/scope sources for literal-drift checks)
const SCRIPTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const PLUGIN_ROOT = resolve(SCRIPTS_DIR, "..");
const REPO_ROOT   = resolve(PLUGIN_ROOT, "..");
const pp = (...p) => join(PLUGIN_ROOT, ...p);  // plugin-internal files
const rp = (...p) => join(REPO_ROOT, ...p);    // monorepo canonical sources

// --- error collection -------------------------------------------------------

const errors = [];
const warns  = [];
const fail   = (file, reason) => errors.push({ file, reason });
const warn   = (file, reason) => warns.push({ file, reason });

// --- I/O helpers ------------------------------------------------------------

function readJSONat(abs) {
  let raw;
  try { raw = readFileSync(abs, "utf8"); } catch { fail(abs, "File not found or unreadable"); return null; }
  try { return JSON.parse(raw); } catch (e) { fail(abs, `Invalid JSON: ${e.message}`); return null; }
}
const readJSON = (rel) => readJSONat(pp(rel));

function readRepo(rel) {
  const abs = rp(rel);
  try { return readFileSync(abs, "utf8"); }
  catch { fail(abs, "Not found (needed for literal-drift check)"); return null; }
}

// --- templates --------------------------------------------------------------

const PLAN_CONTENT_MAX = 50_000;
const CANON_JP = ["未着手", "進行中", "完了", "破棄"];

function checkTemplates() {
  const tmplDir = pp("templates");
  const planTmpl = join(tmplDir, "plan-template.md");
  const agentsSample = join(tmplDir, "AGENTS.md.sample");

  let raw;
  try { raw = readFileSync(planTmpl, "utf8"); } catch { fail(planTmpl, "File not found"); return; }
  if (!raw.trim().length) { fail(planTmpl, "empty"); return; }
  const byteLen = Buffer.byteLength(raw, "utf8");
  if (byteLen >= PLAN_CONTENT_MAX) fail(planTmpl, `exceeds PLAN_CONTENT_MAX: ${byteLen} bytes (max ${PLAN_CONTENT_MAX - 1})`);

  // JP status-label hygiene: pipe-table cells of 2–4 JP chars must be canonical.
  // Strip HTML comments first to avoid matching documentation tables inside <!-- -->.
  const rawNoComments = raw.replace(/<!--[\s\S]*?-->/g, "");
  for (const [, cell] of rawNoComments.matchAll(/\|\s*([^\|]{2,4})\s*\|/g)) {
    const t = cell.trim();
    if (/^[　-鿿豈-﫿]{2,4}$/.test(t) && !CANON_JP.includes(t))
      fail(planTmpl, `Non-canonical JP status label "${t}" in table. Valid: ${CANON_JP.join(", ")}`);
  }

  // Marker-family presence (use comment-stripped string — same as JP-label check above)
  if (!/(✅|完了|済)/.test(rawNoComments)) fail(planTmpl, 'Missing done-family marker (✅ / 完了 / 済)');
  if (!/進行中|着手/.test(rawNoComments)) fail(planTmpl, 'Missing in_progress-family marker (進行中 / 着手)');
  if (!/- \[ \]/.test(rawNoComments)) fail(planTmpl, 'Missing not_started example (- [ ])');

  let sampleRaw;
  try { sampleRaw = readFileSync(agentsSample, "utf8"); } catch { fail(agentsSample, "File not found"); return; }
  if (!sampleRaw.trim().length) fail(agentsSample, "empty");
}

// --- canonical literal extraction -------------------------------------------

const arrRe = (name) => new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\[([^\\]]+)\\]`, "s");
const objRe = (name) => new RegExp(`const\\s+${name}[^=]*=\\s*(?:Object\\.freeze\\()?\\{([^}]+)\\}`, "s");
const extractArr  = (src, name) => { const m = src.match(arrRe(name)); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null; };
const extractKeys = (src, name) => { const m = src.match(objRe(name)); return m ? [...m[1].matchAll(/^\s*([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((x) => x[1]) : null; };
// Extract string values (quoted) from an object literal — used for PLAN_STATUS_LABELS JP values.
const extractVals = (src, name) => { const m = src.match(objRe(name)); return m ? [...m[1].matchAll(/:\s*"([^"]+)"/g)].map((x) => x[1]) : null; };

function loadCanonicals() {
  // The literal-drift check cross-references the monorepo's source enums. The
  // standalone plugin repo (the published mirror) does not contain them, so
  // detect that and skip the drift check with a warning instead of failing.
  const inMonorepo =
    existsSync(rp("packages/core/src/status.ts")) && existsSync(rp("apps/web/lib/oauth/scopes.ts"));
  if (!inMonorepo) {
    warn(PLUGIN_ROOT, "literal-drift check skipped: monorepo canonical sources not present (expected in the standalone plugin repo)");
    return null;
  }

  const [sSrc, rSrc, scSrc, scopeSrc] = [
    readRepo("packages/core/src/status.ts"),
    readRepo("packages/core/src/results.ts"),
    readRepo("packages/core/src/schemas.ts"),
    readRepo("apps/web/lib/oauth/scopes.ts"),
  ];
  if (!sSrc || !rSrc || !scSrc || !scopeSrc) return null;

  const planStatuses      = extractArr(sSrc,  "PLAN_STATUSES");
  const planStatusLabels  = extractVals(sSrc, "PLAN_STATUS_LABELS");
  const testVerdicts      = extractArr(rSrc,  "TEST_VERDICTS");
  const reviewVerdicts    = extractArr(rSrc,  "REVIEW_VERDICTS");
  const planDocumentKinds = extractArr(scSrc, "PLAN_DOCUMENT_KINDS");
  const toolNames         = extractKeys(scopeSrc, "TOOL_SCOPE_MAP");

  const missing = ["PLAN_STATUSES", "PLAN_STATUS_LABELS", "TEST_VERDICTS", "REVIEW_VERDICTS", "PLAN_DOCUMENT_KINDS", "TOOL_SCOPE_MAP"]
    .filter((_, i) => ![planStatuses, planStatusLabels, testVerdicts, reviewVerdicts, planDocumentKinds, toolNames][i]);
  if (missing.length) { fail(rp("packages/core/src/"), `Could not extract: ${missing.join(", ")}`); return null; }

  return { planStatuses, planStatusLabels, testVerdicts, reviewVerdicts, planDocumentKinds, toolNames };
}

// --- .cursor-plugin/plugin.json ---------------------------------------------

function checkPlugin() {
  const d = readJSON(".cursor-plugin/plugin.json");
  if (!d) return;
  const f = pp(".cursor-plugin/plugin.json");

  if (!/^[a-z][a-z0-9-]*$/.test(d.name)) fail(f, `name must be kebab-case, got: ${JSON.stringify(d.name)}`);
  else if (d.name !== "nolto") fail(f, `name must be "nolto", got: "${d.name}"`);

  if (!/^\d+\.\d+\.\d+$/.test(d.version)) fail(f, `version must be semver, got: ${JSON.stringify(d.version)}`);
  if (d.version !== "0.1.4") fail(f, `version must be "0.1.4", got: "${d.version}"`);

  // Cursor uses top-level displayName (not nested under an interface object)
  if (typeof d.displayName !== "string" || !d.displayName)
    fail(f, "displayName must be a non-empty string at the top level");

  for (const k of ["description", "homepage", "repository", "license"])
    if (typeof d[k] !== "string" || !d[k]) fail(f, `${k} must be a non-empty string`);

  if (!d.author || typeof d.author !== "object") fail(f, "author must be an object");
  else {
    if (!d.author.name)  fail(f, "author.name must be a non-empty string");
    if (!d.author.email) fail(f, "author.email must be a non-empty string");
  }

  if (!Array.isArray(d.keywords) || !d.keywords.length) fail(f, "keywords must be a non-empty array");

  // Cursor plugin.json must NOT have component-pointer fields (auto-discovered)
  for (const k of ["interface", "skills", "mcpServers", "hooks"])
    if (k in d) fail(f, `plugin.json must NOT contain "${k}" field (Cursor auto-discovers components)`);
}

// --- .cursor-plugin/marketplace.json (warn-only for v0.1.0) -----------------

function checkMarketplace() {
  const f = pp(".cursor-plugin/marketplace.json");
  const w = (reason) => warn(f, reason);
  const errsBefore = errors.length;
  const d = readJSONat(f);
  // readJSONat already reports missing/malformed files as hard errors.
  if (errors.length > errsBefore) return;
  // A file that parses to a falsy primitive (null, "", 0) or a non-object must
  // not pass silently — surface it as a warning (marketplace is warn-only for v0.1.0).
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    w("marketplace.json must be a JSON object");
    return;
  }

  if (d.name !== "nolto") w(`name must be "nolto", got: ${JSON.stringify(d.name)}`);

  // Cursor marketplace uses owner.name/email (not interface.displayName)
  if (!d.owner || typeof d.owner !== "object") w("owner must be an object");
  else {
    if (!d.owner.name)  w("owner.name must be a non-empty string");
    if (!d.owner.email) w("owner.email must be a non-empty string");
  }

  if (!Array.isArray(d.plugins) || !d.plugins.length) { w("plugins must be a non-empty array"); return; }
  const e = d.plugins[0];
  if (e.name !== "nolto") w(`plugins[0].name must be "nolto"`);
  // Cursor flat layout: source is the string "./"
  if (e.source !== "./") w(`plugins[0].source must be "./" (flat layout), got: ${JSON.stringify(e.source)}`);
  if (e.version !== "0.1.4") w(`plugins[0].version must be "0.1.4", got: "${e.version}"`);
  if (!e.description) w("plugins[0].description must be non-empty");
}

// --- mcp.json ---------------------------------------------------------------

function checkMcp() {
  const d = readJSON("mcp.json");
  if (!d) return;
  const f = pp("mcp.json");
  const s = d?.mcpServers?.nolto;
  if (!s) { fail(f, "mcpServers.nolto must be present"); return; }

  if (s.url !== "https://nolto.app/mcp") fail(f, `mcpServers.nolto.url must be "https://nolto.app/mcp"`);

  // Zero-secret assertions: none of these fields are allowed in the shipped mcp.json
  if ("type" in s)                fail(f, `mcpServers.nolto must NOT have "type" (Cursor infers from url)`);
  if ("headers" in s)             fail(f, `mcpServers.nolto must NOT have "headers" (zero-secret assertion)`);
  if ("bearer_token_env_var" in s) fail(f, `mcpServers.nolto must NOT have "bearer_token_env_var" (zero-secret assertion)`);
  if ("http_headers" in s)        fail(f, `mcpServers.nolto must NOT have "http_headers" (zero-secret assertion)`);
}

// --- hooks/hooks.json (Cursor native flat Stop-hook shape) ------------------

function checkHooks() {
  const abs = pp("hooks/hooks.json");
  let raw;
  try { raw = readFileSync(abs, "utf8"); } catch { fail(abs, "hooks/hooks.json not found"); return; }
  let d;
  try { d = JSON.parse(raw); } catch (e) { fail(abs, `hooks/hooks.json invalid JSON: ${e.message}`); return; }
  if (!d || typeof d !== "object") { fail(abs, "hooks/hooks.json must be a top-level object"); return; }

  // version:1 is required
  if (d.version !== 1) fail(abs, `hooks.version must be 1, got: ${JSON.stringify(d.version)}`);

  if (!d.hooks || typeof d.hooks !== "object") { fail(abs, "hooks/hooks.json must have a top-level hooks object"); return; }

  // Cursor uses lowercase "stop" (NOT "Stop" like Claude)
  if ("Stop" in d.hooks) fail(abs, `hooks key must be lowercase "stop", NOT "Stop" (Cursor schema)`);
  const stopArr = d.hooks["stop"];
  if (!Array.isArray(stopArr) || stopArr.length === 0) {
    fail(abs, 'hooks.stop must be a non-empty array (lowercase "stop")');
    return;
  }

  // allowedEnvVars is Claude-only — must NOT appear in Cursor hooks
  if ("allowedEnvVars" in d) fail(abs, '"allowedEnvVars" must NOT be present in Cursor hooks (Claude-only field)');

  for (let i = 0; i < stopArr.length; i++) {
    const entry = stopArr[i];
    if (!entry || typeof entry !== "object") { fail(abs, `hooks.stop[${i}] must be an object`); continue; }

    // allowedEnvVars at entry level is also forbidden
    if ("allowedEnvVars" in entry) fail(abs, `hooks.stop[${i}] must NOT have "allowedEnvVars" (Claude-only field)`);

    if (typeof entry.command !== "string" || !entry.command)
      fail(abs, `hooks.stop[${i}].command must be a non-empty string`);
    else if (!entry.command.includes("nolto"))
      fail(abs, `hooks.stop[${i}].command must reference "nolto", got: ${JSON.stringify(entry.command)}`);

    if (entry.timeout !== undefined && (typeof entry.timeout !== "number" || entry.timeout <= 0))
      fail(abs, `hooks.stop[${i}].timeout must be a positive number`);

    if (entry.type !== undefined && entry.type !== "command")
      fail(abs, `hooks.stop[${i}].type must be "command" when specified, got: ${JSON.stringify(entry.type)}`);
  }
}

// --- install script ---------------------------------------------------------
// --plugin-dir does not register MCP/skills, so v0.1.0 ships scripts/install.sh
// to place components into Cursor's standard locations. Validate it stays usable.
function checkInstallScript() {
  const abs = pp("scripts/install.sh");
  let raw;
  try { raw = readFileSync(abs, "utf8"); } catch { fail(abs, "scripts/install.sh not found"); return; }
  if (!raw.startsWith("#!")) fail(abs, "scripts/install.sh must start with a shebang");
  try {
    if (!(statSync(abs).mode & 0o111)) fail(abs, "scripts/install.sh must be executable (chmod +x)");
  } catch { /* statSync already implies readable; ignore */ }
  // It must wire all three component locations.
  for (const needle of ["skills", "mcp.json", "hooks.json"]) {
    if (!raw.includes(needle)) fail(abs, `scripts/install.sh must handle ${needle}`);
  }
}

// --- skills -----------------------------------------------------------------

function parseFm(raw, file) {
  const parts = raw.split(/^---\s*$/m);
  if (parts.length < 3) { fail(file, "Frontmatter fences missing or malformed"); return null; }
  const fm = {};
  for (const line of parts[1].split("\n")) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    const k = line.slice(0, ci).trim();
    if (k) fm[k] = line.slice(ci + 1).trim();
  }
  return { fm, body: parts.slice(2).join("---") };
}

function checkSkillBody(body, file, c) {
  const canonSet = new Set([...c.planStatuses, ...c.testVerdicts, ...c.reviewVerdicts, ...c.planDocumentKinds]);
  const toolSet  = new Set(c.toolNames);

  // Tool-name check: Cursor skills use bare names only (no vendor-prefixed tool names).
  // Scan code-fenced blocks and backtick-wrapped lowercase-underscore identifiers.
  // The nonEnum allowlist covers common prose tokens that aren't enum values or tool names.
  const nonEnum = new Set([
    ...c.toolNames,
    "planId","phaseId","projectId","uuid","queued","processing","completed",
    "status","verdict","message","summary","round","title","content","phases",
    "type","http","url","headers","encoding","utf","base","kind","source",
    "hash","path","file","api","mcp","manual","ok",
  ]);

  // Helper: report an unknown identifier with the correct error class.
  function reportUnknown(lit, context) {
    if (lit.includes("_")) {
      fail(file, `${context} references unknown tool "${lit}" (not in TOOL_SCOPE_MAP). Valid tools: ${[...toolSet].join(", ")}`);
    } else {
      fail(file, `\`${lit}\` not in PLAN_STATUSES/TEST_VERDICTS/REVIEW_VERDICTS/PLAN_DOCUMENT_KINDS. Valid: ${[...canonSet].join(", ")}`);
    }
  }

  // --- Pass 1: inline backtick-wrapped identifiers ---
  // Strip fenced code blocks first so backtick scanning does not double-count them.
  const bodyNoFenced = body.replace(/```[\s\S]*?```/g, "");
  const lits = [...bodyNoFenced.matchAll(/`([^`\n]+)`/g)]
    .map((m) => m[1])
    .flatMap((l) => (l.includes("|") ? l.split("|").map((s) => s.trim()) : [l]))
    .filter((l) => /^[a-z][a-z_]*$/.test(l));
  for (const lit of lits) {
    if (nonEnum.has(lit) || toolSet.has(lit)) continue;
    if (!canonSet.has(lit)) reportUnknown(lit, `\`${lit}\``);
  }

  // --- Pass 2: fenced code block tool calls ---
  // Extract identifiers that look like tool CALLS (name followed immediately by '(')
  // from inside triple-backtick fenced blocks.
  const fencedRe = /```[^\n]*\n([\s\S]*?)```/g;
  for (const fencedMatch of body.matchAll(fencedRe)) {
    const block = fencedMatch[1];
    const callRe = /\b([a-z][a-z_]*_[a-z][a-z_]*)\(/g;
    for (const callMatch of block.matchAll(callRe)) {
      const name = callMatch[1];
      if (toolSet.has(name)) continue;
      fail(file, `Fenced block references unknown tool "${name}" (not in TOOL_SCOPE_MAP). Valid tools: ${[...toolSet].join(", ")}`);
    }
  }
}

// JP label table pattern: rows of the form "| `<status_enum>` | <jp_label> |"
const JP_LABEL_RE = /\|\s*`([a-z][a-z_]*)`\s*\|\s*([^|]+?)\s*\|/g;

function checkJpStatusLabels(c) {
  const skillFile = pp("skills/plan-status/SKILL.md");
  let raw;
  try { raw = readFileSync(skillFile, "utf8"); }
  catch { fail(skillFile, "Not found (needed for JP label drift check)"); return; }

  const statusSet = new Set(c.planStatuses);
  const labelSet  = new Set(c.planStatusLabels);
  for (const [, statusKey, cell] of raw.matchAll(JP_LABEL_RE)) {
    if (!statusSet.has(statusKey)) continue;
    const label = cell.trim();
    if (!/[　-鿿豈-﫿]/.test(label)) continue;
    if (!labelSet.has(label)) {
      fail(skillFile, `JP status label "${label}" is not in PLAN_STATUS_LABELS. Valid: ${[...labelSet].join(", ")}`);
    }
  }
}

function checkSkills(c) {
  let dirs;
  const sd = pp("skills");
  try { dirs = readdirSync(sd, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); }
  catch { fail(sd, "skills/ directory not found"); return; }
  if (!dirs.length) { fail(sd, "No skill directories found"); return; }

  for (const dir of dirs) {
    const f = pp("skills", dir, "SKILL.md");
    let raw;
    try { raw = readFileSync(f, "utf8"); } catch { fail(f, "SKILL.md not found"); continue; }
    const parsed = parseFm(raw, f);
    if (!parsed) continue;
    const { fm, body } = parsed;
    if (!fm.name) fail(f, "frontmatter.name is missing");
    else if (fm.name !== dir) fail(f, `frontmatter.name "${fm.name}" does not match dir "${dir}"`);
    if (!fm.description || fm.description.length < 20) fail(f, `frontmatter.description must be ≥20 chars`);
    if (c) checkSkillBody(body, f, c);
  }
}

// --- main -------------------------------------------------------------------

checkPlugin();
checkMarketplace();
checkMcp();
checkHooks();
checkInstallScript();
checkTemplates();
const canonicals = loadCanonicals();
if (canonicals) checkJpStatusLabels(canonicals);
checkSkills(canonicals);

if (warns.length) {
  for (const { file, reason } of warns) process.stdout.write(`WARN  ${file}\n      ${reason}\n`);
  process.stdout.write(`\n${warns.length} warning(s) (marketplace checks are warn-only for v0.1.0)\n\n`);
}

if (errors.length) {
  for (const { file, reason } of errors) process.stdout.write(`FAIL  ${file}\n      ${reason}\n`);
  process.stdout.write(`\n${errors.length} error(s) found. Validation failed.\n`);
  process.exit(1);
} else {
  const n = (() => { try { return readdirSync(pp("skills"), { withFileTypes: true }).filter((d) => d.isDirectory()).length; } catch { return 0; } })();
  process.stdout.write(`OK    plugin.json / marketplace.json / mcp.json / hooks / templates / ${n} skills — all checks passed.\n`);
  process.exit(0);
}
