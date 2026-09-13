export type PerfArgs = Readonly<{
  evidenceDirectory?: string;
  baseUrl?: string;
  local: boolean;
  target: boolean;
  physical: boolean;
  serverPid?: number;
  sessions?: number;
  durationSeconds?: number;
}>;

function optionValue(argv: readonly string[], name: string): string | undefined {
  const exact = argv.indexOf(name);
  if (exact >= 0) return argv[exact + 1];
  const prefix = `${name}=`;
  return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

function positiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new TypeError(`${name} must be a positive integer.`);
  return parsed;
}

export function parsePerfArgs(argv = process.argv.slice(2)): PerfArgs {
  return Object.freeze({
    evidenceDirectory: optionValue(argv, "--evidence-dir"),
    baseUrl: optionValue(argv, "--base-url") ?? process.env.PERF_BASE_URL,
    local: argv.includes("--local"),
    target: argv.includes("--target"),
    physical: argv.includes("--physical"),
    serverPid: positiveInteger(optionValue(argv, "--server-pid"), "server PID"),
    sessions: positiveInteger(optionValue(argv, "--sessions"), "sessions"),
    durationSeconds: positiveInteger(optionValue(argv, "--duration-seconds"), "duration seconds"),
  });
}
