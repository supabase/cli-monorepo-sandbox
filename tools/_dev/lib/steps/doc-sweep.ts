import { existsSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { log } from "../log.ts";
import { replaceInFile } from "../file-edit.ts";
import type { RunContext } from "../types.ts";

const OLD = ".repos/supabase-cli-go";
const NEW = "apps/cli-go";

const KNOWN_DOC_FILES = [
  "apps/cli/CLAUDE.md",
  "apps/cli/README.md",
  "apps/cli/AGENTS.md",
  "apps/cli/docs/binary-distribution.md",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "CONTRIBUTING.md",
  "docs/adr/0011-cli-release-and-distribution-strategy.md",
];

export async function docSweep(ctx: RunContext): Promise<void> {
  log.phase("Phase 7", `replace ${OLD} → ${NEW} across docs`);

  const seen = new Set<string>();
  let totalOccurrences = 0;

  for (const rel of KNOWN_DOC_FILES) {
    const abs = join(ctx.cwd, rel);
    if (!existsSync(abs)) {
      log.info(`skip ${rel} (not present)`);
      continue;
    }
    const result = replaceInFile(abs, OLD, NEW);
    if (result.changed) {
      log.ok(`patched ${rel} (${result.occurrences})`);
      totalOccurrences += result.occurrences;
    }
    seen.add(rel);
  }

  // Defensive sweep: catch any references we didn't enumerate explicitly.
  const grep = await $`rg -l --hidden --glob '!.git' --glob '!apps/cli-go/**' --glob '!tools/_dev/**' --fixed-strings ${OLD}`
    .cwd(ctx.cwd)
    .quiet()
    .nothrow();
  const extras = grep.stdout
    .toString()
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !seen.has(s));

  for (const rel of extras) {
    const abs = join(ctx.cwd, rel);
    if (!existsSync(abs)) continue;
    const result = replaceInFile(abs, OLD, NEW);
    if (result.changed) {
      log.warn(`extra hit (not in known list): ${rel} (${result.occurrences})`);
      totalOccurrences += result.occurrences;
    }
  }

  log.ok(`doc sweep replaced ${totalOccurrences} occurrence${totalOccurrences === 1 ? "" : "s"}`);
}
