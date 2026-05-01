import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isMap, isScalar, parseDocument, YAMLMap, YAMLSeq } from "yaml";

// `YAMLMap.get(key)` unwraps Scalar nodes and returns the raw value, so step
// names come back as plain strings (or non-string nodes for non-scalar
// values). Normalise to `string | null` for downstream comparisons.
function readStepName(step: YAMLMap): string | null {
  const name = step.get("name");
  if (typeof name === "string") return name;
  return null;
}

export interface ReplaceResult {
  changed: boolean;
  occurrences: number;
}

export function replaceInFile(absPath: string, search: string, replacement: string): ReplaceResult {
  if (!existsSync(absPath)) return { changed: false, occurrences: 0 };
  const before = readFileSync(absPath, "utf8");
  const occurrences = before.split(search).length - 1;
  if (occurrences === 0) return { changed: false, occurrences: 0 };
  const after = before.replaceAll(search, replacement);
  writeFileSync(absPath, after);
  return { changed: true, occurrences };
}

export function appendUniqueLine(absPath: string, line: string): boolean {
  if (!existsSync(absPath)) {
    writeFileSync(absPath, line.endsWith("\n") ? line : `${line}\n`);
    return true;
  }
  const before = readFileSync(absPath, "utf8");
  if (before.split("\n").includes(line)) return false;
  const sep = before.endsWith("\n") || before.length === 0 ? "" : "\n";
  writeFileSync(absPath, `${before}${sep}${line}\n`);
  return true;
}

/**
 * Append rules to a golangci-lint v2 config's `linters.exclusions.rules`
 * sequence, creating intermediate nodes as needed. Idempotent: a rule whose
 * stringified shape matches an existing rule is skipped. Returns the number
 * of rules added.
 */
export function appendGolangciExclusions(
  absPath: string,
  newRules: Array<Record<string, unknown>>,
): number {
  if (!existsSync(absPath)) return 0;
  const raw = readFileSync(absPath, "utf8");
  const doc = parseDocument(raw);

  let linters = doc.get("linters");
  if (!isMap(linters)) {
    linters = new YAMLMap();
    doc.set("linters", linters);
  }
  let exclusions = (linters as YAMLMap).get("exclusions");
  if (!isMap(exclusions)) {
    exclusions = new YAMLMap();
    (linters as YAMLMap).set("exclusions", exclusions);
  }
  let rules = (exclusions as YAMLMap).get("rules");
  if (!(rules instanceof YAMLSeq)) {
    rules = new YAMLSeq();
    (exclusions as YAMLMap).set("rules", rules);
  }

  const existing = new Set(rules.items.map((item) => JSON.stringify(item)));
  let added = 0;
  for (const r of newRules) {
    const node = doc.createNode(r);
    if (existing.has(JSON.stringify(node))) continue;
    rules.items.push(node);
    added++;
  }

  if (added > 0) writeFileSync(absPath, doc.toString());
  return added;
}

/**
 * Remove a job from a workflow's `jobs` map. Returns true if removed.
 */
export function removeWorkflowJob(absPath: string, jobName: string): boolean {
  if (!existsSync(absPath)) return false;
  const raw = readFileSync(absPath, "utf8");
  const doc = parseDocument(raw);

  const jobs = doc.get("jobs");
  if (!isMap(jobs)) return false;
  if (!jobs.has(jobName)) return false;

  jobs.delete(jobName);
  writeFileSync(absPath, doc.toString());
  return true;
}

/**
 * Replace branch names in a workflow's `on.push.branches` and
 * `on.pull_request.branches` arrays. Returns the number of replacements made.
 */
export function swapWorkflowBranches(absPath: string, from: string, to: string): number {
  if (!existsSync(absPath)) return 0;
  const raw = readFileSync(absPath, "utf8");
  const doc = parseDocument(raw);

  const on = doc.get("on");
  if (!isMap(on)) return 0;

  let replacements = 0;
  for (const event of ["push", "pull_request"]) {
    const evt = on.get(event);
    if (!isMap(evt)) continue;
    const branches = evt.get("branches");
    if (!(branches instanceof YAMLSeq)) continue;
    for (const item of branches.items) {
      if (isScalar(item) && String(item.value) === from) {
        item.value = to;
        replacements++;
      }
    }
  }

  if (replacements > 0) writeFileSync(absPath, doc.toString());
  return replacements;
}

/**
 * Insert one or more steps into a job's `steps` sequence, immediately before
 * the named anchor step. Each new step is provided as a plain JS object that
 * will be serialized as YAML. Returns true if the steps were inserted.
 *
 * Idempotent: if any of the new step `name`s already appear in the job's
 * steps (anywhere), the function returns false and inserts nothing.
 */
export function insertWorkflowStepsBefore(
  absPath: string,
  jobName: string,
  beforeStepName: string,
  newSteps: Array<Record<string, unknown>>,
): boolean {
  if (!existsSync(absPath)) return false;
  const raw = readFileSync(absPath, "utf8");
  const doc = parseDocument(raw);

  const jobs = doc.get("jobs");
  if (!isMap(jobs)) return false;
  const job = jobs.get(jobName);
  if (!isMap(job)) return false;
  const steps = job.get("steps");
  if (!(steps instanceof YAMLSeq)) return false;

  const newNames = new Set(newSteps.map((s) => String(s.name ?? "")));
  for (const item of steps.items) {
    if (!isMap(item)) continue;
    const name = readStepName(item);
    if (name !== null && newNames.has(name)) return false;
  }

  const idx = steps.items.findIndex((item) => {
    if (!isMap(item)) return false;
    return readStepName(item) === beforeStepName;
  });
  if (idx === -1) return false;

  const yamlNodes = newSteps.map((s) => doc.createNode(s));
  steps.items.splice(idx, 0, ...yamlNodes);
  writeFileSync(absPath, doc.toString());
  return true;
}

/**
 * Parse a workflow YAML and remove a step (by `name`) from a job's `steps`
 * sequence. Returns true if the step was removed.
 */
export function removeWorkflowStep(absPath: string, jobName: string, stepName: string): boolean {
  if (!existsSync(absPath)) return false;
  const raw = readFileSync(absPath, "utf8");
  const doc = parseDocument(raw);

  const jobs = doc.get("jobs");
  if (!isMap(jobs)) return false;
  const job = jobs.get(jobName);
  if (!isMap(job)) return false;
  const steps = job.get("steps");
  if (!(steps instanceof YAMLSeq)) return false;

  const idx = steps.items.findIndex((item) => {
    if (!isMap(item)) return false;
    return readStepName(item) === stepName;
  });
  if (idx === -1) return false;

  steps.items.splice(idx, 1);
  writeFileSync(absPath, doc.toString());
  return true;
}
