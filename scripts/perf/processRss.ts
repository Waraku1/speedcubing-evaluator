export type ProcessRssRow = Readonly<{
  pid: number;
  parentPid: number;
  rssKiB: number;
  command: string;
}>;

export function parsePsRss(output: string): ProcessRssRow[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) {
        throw new TypeError("Unexpected ps RSS row.");
      }
      return Object.freeze({
        pid: Number(match[1]),
        parentPid: Number(match[2]),
        rssKiB: Number(match[3]),
        command: match[4],
      });
    });
}

export function processTreeRows(
  rows: readonly ProcessRssRow[],
  rootPid: number
): ProcessRssRow[] {
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    throw new TypeError("Root PID must be a positive integer.");
  }

  const selected = new Set<number>([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (selected.has(row.parentPid) && !selected.has(row.pid)) {
        selected.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => selected.has(row.pid));
}

export function totalRssBytes(rows: readonly ProcessRssRow[]): number {
  return rows.reduce((total, row) => total + row.rssKiB * 1024, 0);
}
