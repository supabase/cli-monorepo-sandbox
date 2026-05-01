import type { Check } from "../types.ts";

export const check: Check = async (_ctx) => {
  return {
    id: 9,
    label: "CI green on draft PR",
    status: "manual",
    detail: "push branch + open draft PR; verify test.yml succeeds (cache key, working-directory, go-version-file)",
  };
};
