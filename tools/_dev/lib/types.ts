import type { Rollback } from "./rollback.ts";

export interface Args {
  targetDir: string;
  dxLabSource: string;
  dxLabBranch: string;
  consolidationBranch: string;
  noReset: boolean;
  skipVerify: boolean;
  verifyOnly: boolean;
  quickVerify: boolean;
  releaseSmoke: boolean;
  targetDefaultBranch: string;
  includeApiSync: boolean;
  keepBumpdoc: boolean;
}

export interface RunContext {
  args: Args;
  cwd: string;
  rollback: Rollback;
  startingBranch: string;
  startingSha: string;
}

export const PRE_CONSOLIDATION_TAG = "pre-consolidation";
export const DX_LAB_REMOTE = "dx-lab";
