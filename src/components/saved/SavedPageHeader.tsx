import type { AuthUserV1 } from "../../lib/auth/authV1";
import { WorkbenchHeader } from "../workbench/WorkbenchHeader";

export function SavedPageHeader({
  authUser,
  callbackUrl = "/saved",
}: Readonly<{ authUser: AuthUserV1 | null; callbackUrl?: string }>) {
  return <WorkbenchHeader authUser={authUser} callbackUrl={callbackUrl} />;
}
