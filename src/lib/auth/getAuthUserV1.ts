import { getServerSession } from "next-auth";

import { authOptionsV1, authUserFromSessionV1, type AuthUserV1 } from "./authV1";

export async function getAuthUserV1(): Promise<AuthUserV1 | null> {
  if (authOptionsV1 === null) return null;
  return authUserFromSessionV1(await getServerSession(authOptionsV1));
}
