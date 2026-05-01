import type { Check } from "../types.ts";

export const check: Check = async (_ctx) => {
  return {
    id: 10,
    label: "open-PR rebase smoke test",
    status: "manual",
    detail:
      "pick 3 random open supabase/cli PRs (`gh pr list -L 30 --json number -q '.[].number'`), `git rebase chore/monorepo-consolidation` each — expect rename detection to handle apps/cli-go moves",
  };
};
