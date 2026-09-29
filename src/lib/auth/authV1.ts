import type { Session } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import type { JWT } from "next-auth/jwt";

export const AUTH_ENVIRONMENT_KEYS_V1 = Object.freeze([
  "GITHUB_ID",
  "GITHUB_SECRET",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
] as const);

type AuthEnvironmentKeyV1 = (typeof AUTH_ENVIRONMENT_KEYS_V1)[number];

export type AuthEnvironmentV1 = Readonly<{
  githubId: string;
  githubSecret: string;
  nextAuthSecret: string;
  nextAuthUrl: string;
}>;

export type AuthEnvironmentResolutionV1 =
  | Readonly<{ status: "READY"; environment: AuthEnvironmentV1 }>
  | Readonly<{
      status: "UNAVAILABLE";
      missing: readonly AuthEnvironmentKeyV1[];
      invalid: readonly AuthEnvironmentKeyV1[];
    }>;

export type AuthUserV1 = Readonly<{
  ownerId: string;
  displayName?: string;
  email?: string;
  image?: string;
}>;

type EnvironmentSourceV1 = Readonly<Record<string, string | undefined>>;

function nonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isApprovedAuthOrigin(value: string, nodeEnvironment: string | undefined): boolean {
  try {
    const url = new URL(value);
    const hasOnlyOrigin =
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      (url.pathname === "" || url.pathname === "/");
    if (!hasOnlyOrigin) return false;

    if (url.protocol === "https:") return true;
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return nodeEnvironment !== "production" && url.protocol === "http:" && loopback;
  } catch {
    return false;
  }
}

export function resolveAuthEnvironmentV1(
  source: EnvironmentSourceV1 = process.env,
  nodeEnvironment: string | undefined = process.env.NODE_ENV
): AuthEnvironmentResolutionV1 {
  const values = Object.fromEntries(
    AUTH_ENVIRONMENT_KEYS_V1.map((key) => [key, nonEmpty(source[key])])
  ) as Record<AuthEnvironmentKeyV1, string | null>;
  const missing = AUTH_ENVIRONMENT_KEYS_V1.filter((key) => values[key] === null);
  const invalid: AuthEnvironmentKeyV1[] = [];

  if (
    values.NEXTAUTH_URL !== null &&
    !isApprovedAuthOrigin(values.NEXTAUTH_URL, nodeEnvironment)
  ) {
    invalid.push("NEXTAUTH_URL");
  }

  if (missing.length > 0 || invalid.length > 0) {
    return Object.freeze({
      status: "UNAVAILABLE",
      missing: Object.freeze([...missing]),
      invalid: Object.freeze(invalid),
    });
  }

  return Object.freeze({
    status: "READY",
    environment: Object.freeze({
      githubId: values.GITHUB_ID as string,
      githubSecret: values.GITHUB_SECRET as string,
      nextAuthSecret: values.NEXTAUTH_SECRET as string,
      nextAuthUrl: values.NEXTAUTH_URL as string,
    }),
  });
}

export function githubOwnerIdV1(subject: unknown): string | null {
  const value = typeof subject === "number" ? String(subject) : subject;
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) return null;
  return `github:${value}`;
}

export function withGitHubOwnerV1(
  token: JWT,
  account: Readonly<{ provider?: string; providerAccountId?: string }> | null
): JWT {
  if (account?.provider !== "github") return token;
  const ownerId = githubOwnerIdV1(account.providerAccountId);
  if (ownerId === null) return token;
  return { ...token, ownerId };
}

function optionalText(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized === "" || normalized.length > maximumLength) return undefined;
  return normalized;
}

export function projectPublicSessionV1(session: Session, token: JWT): Session {
  const ownerId = optionalText(token.ownerId, 64);
  if (ownerId === undefined || !/^github:\d{1,20}$/.test(ownerId)) {
    return { expires: session.expires };
  }

  return {
    expires: session.expires,
    user: {
      ownerId,
      name: optionalText(token.name ?? session.user?.name, 100),
      email: optionalText(token.email ?? session.user?.email, 320),
      image: optionalText(token.picture ?? session.user?.image, 2048),
    },
  };
}

export function authUserFromSessionV1(session: Session | null): AuthUserV1 | null {
  const ownerId = optionalText(session?.user?.ownerId, 64);
  if (ownerId === undefined || !/^github:\d{1,20}$/.test(ownerId)) return null;

  const displayName = optionalText(session?.user?.name, 100);
  const email = optionalText(session?.user?.email, 320);
  const image = optionalText(session?.user?.image, 2048);
  return Object.freeze({
    ownerId,
    ...(displayName === undefined ? {} : { displayName }),
    ...(email === undefined ? {} : { email }),
    ...(image === undefined ? {} : { image }),
  });
}

export function safeAuthRedirectV1(url: string, baseUrl: string): string {
  try {
    const base = new URL(baseUrl);
    const target = new URL(url, base);
    return target.origin === base.origin ? target.toString() : base.toString();
  } catch {
    return baseUrl;
  }
}

export function createAuthOptionsV1(environment: AuthEnvironmentV1): NextAuthOptions {
  return {
    secret: environment.nextAuthSecret,
    session: { strategy: "jwt" },
    useSecureCookies: environment.nextAuthUrl.startsWith("https://"),
    providers: [
      GitHubProvider({
        clientId: environment.githubId,
        clientSecret: environment.githubSecret,
      }),
    ],
    callbacks: {
      jwt({ token, account }) {
        return withGitHubOwnerV1(token, account);
      },
      session({ session, token }) {
        return projectPublicSessionV1(session, token);
      },
      redirect({ url, baseUrl }) {
        return safeAuthRedirectV1(url, baseUrl);
      },
    },
  };
}

export const authEnvironmentV1 = resolveAuthEnvironmentV1();
export const authOptionsV1 =
  authEnvironmentV1.status === "READY"
    ? createAuthOptionsV1(authEnvironmentV1.environment)
    : null;
