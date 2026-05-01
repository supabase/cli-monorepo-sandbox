export type CheckStatus = "pass" | "fail" | "manual" | "skip";

export interface CheckResult {
  id: number;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface CheckContext {
  cwd: string;
  /** When true, slow checks (install, build, tests) are skipped and report `skip`. */
  quick: boolean;
  /** When true, also run the optional Verdaccio release-smoke check. */
  releaseSmoke: boolean;
}

export type Check = (ctx: CheckContext) => Promise<CheckResult>;
