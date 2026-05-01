import { readFileSync, writeFileSync } from "node:fs";
import { Document, isMap, isScalar, parseDocument, YAMLMap, YAMLSeq } from "yaml";

const APPS_CLI_GO_GLOB = "apps/cli-go/**";
const APPS_CLI_GO_GO_MOD = "apps/cli-go/go.mod";

function ensurePathsOnEvent(eventValue: unknown, _doc: Document): YAMLMap {
  if (eventValue === null || eventValue === undefined) {
    return new YAMLMap();
  }
  if (isMap(eventValue)) {
    return eventValue;
  }
  return new YAMLMap();
}

function addPathsScoping(doc: Document): void {
  const on = doc.get("on");

  const events = ["push", "pull_request", "merge_group", "schedule", "workflow_dispatch"];

  if (isScalar(on) || (Array.isArray(on) && typeof on !== "object")) {
    return;
  }

  if (Array.isArray(on)) {
    const map = new YAMLMap();
    for (const evt of on) {
      const child = new YAMLMap();
      if (events.includes(String(evt))) {
        const seq = new YAMLSeq();
        seq.add(APPS_CLI_GO_GLOB);
        child.set("paths", seq);
      }
      map.set(evt, child);
    }
    doc.set("on", map);
    return;
  }

  if (!isMap(on)) return;

  for (const event of events) {
    if (!on.has(event)) continue;
    const value = on.get(event);
    const eventMap = ensurePathsOnEvent(value, doc);
    if (!eventMap.has("paths")) {
      const seq = new YAMLSeq();
      seq.add(APPS_CLI_GO_GLOB);
      eventMap.set("paths", seq);
    }
    on.set(event, eventMap);
  }
}

function setDefaultsWorkingDir(doc: Document, workingDir: string): void {
  let defaults = doc.get("defaults");
  if (!isMap(defaults)) {
    defaults = new YAMLMap();
    doc.set("defaults", defaults);
  }
  let runMap = (defaults as YAMLMap).get("run");
  if (!isMap(runMap)) {
    runMap = new YAMLMap();
    (defaults as YAMLMap).set("run", runMap);
  }
  (runMap as YAMLMap).set("working-directory", workingDir);
}

function rewriteGoVersionFile(doc: Document, newPath: string): void {
  const visit = (node: unknown): void => {
    if (isMap(node)) {
      for (const item of node.items) {
        const key = isScalar(item.key) ? String(item.key.value) : String(item.key);
        if (key === "go-version-file" && isScalar(item.value)) {
          item.value.value = newPath;
        } else {
          visit(item.value);
        }
      }
    } else if (Array.isArray((node as { items?: unknown[] })?.items)) {
      for (const child of (node as { items: unknown[] }).items) visit(child);
    }
  };
  visit(doc.contents);
}

export interface LiftPlan {
  src: string;
  dst: string;
}

export function liftWorkflow(plan: LiftPlan, workingDir = "apps/cli-go"): void {
  const raw = readFileSync(plan.src, "utf8");
  const doc = parseDocument(raw);

  addPathsScoping(doc);
  setDefaultsWorkingDir(doc, workingDir);
  rewriteGoVersionFile(doc, APPS_CLI_GO_GO_MOD);

  writeFileSync(plan.dst, doc.toString());
}
