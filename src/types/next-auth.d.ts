import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      ownerId: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    ownerId?: string;
  }
}
