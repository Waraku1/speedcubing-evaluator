import { authOptionsV1 } from "../../../../lib/auth/authV1";
import { createAuthRouteHandlerV1 } from "../../../../lib/auth/authRouteV1";

export const runtime = "nodejs";

const handler = createAuthRouteHandlerV1(authOptionsV1);

export { handler as GET, handler as POST };
