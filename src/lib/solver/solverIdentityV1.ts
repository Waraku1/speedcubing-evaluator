import { createHash } from "node:crypto";

export function sha256V1(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
