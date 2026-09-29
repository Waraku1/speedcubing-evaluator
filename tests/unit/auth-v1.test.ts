import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountControl } from "../../src/components/auth/AccountControl";
import {
  authUserFromSessionV1,
  createAuthOptionsV1,
  githubOwnerIdV1,
  projectPublicSessionV1,
  resolveAuthEnvironmentV1,
  safeAuthRedirectV1,
  withGitHubOwnerV1,
} from "../../src/lib/auth/authV1";

const COMPLETE_ENVIRONMENT = {
  GITHUB_ID: "github-client-id",
  GITHUB_SECRET: "github-client-secret",
  NEXTAUTH_SECRET: "next-auth-secret-with-sufficient-entropy",
  NEXTAUTH_URL: "https://aes.example",
} as const;

describe("Auth V1 environment boundary", () => {
  it("requires every production secret and has no source fallback", () => {
    for (const missing of Object.keys(COMPLETE_ENVIRONMENT)) {
      const source = { ...COMPLETE_ENVIRONMENT, [missing]: undefined };
      const result = resolveAuthEnvironmentV1(source, "production");
      expect(result.status).toBe("UNAVAILABLE");
      if (result.status === "UNAVAILABLE") expect(result.missing).toContain(missing);
    }
  });

  it("accepts only an origin-only HTTPS production URL", () => {
    expect(resolveAuthEnvironmentV1(COMPLETE_ENVIRONMENT, "production").status).toBe(
      "READY"
    );
    for (const nextAuthUrl of [
      "http://aes.example",
      "https://aes.example/auth",
      "https://aes.example?wildcard=true",
      "not-a-url",
    ]) {
      const result = resolveAuthEnvironmentV1(
        { ...COMPLETE_ENVIRONMENT, NEXTAUTH_URL: nextAuthUrl },
        "production"
      );
      expect(result.status).toBe("UNAVAILABLE");
      if (result.status === "UNAVAILABLE") expect(result.invalid).toContain("NEXTAUTH_URL");
    }
  });
});

describe("Auth V1 identity and public session", () => {
  it("uses the GitHub provider subject as the stable owner identity", () => {
    expect(githubOwnerIdV1(123456)).toBe("github:123456");
    expect(githubOwnerIdV1("987654")).toBe("github:987654");
    expect(githubOwnerIdV1("person@example.com")).toBeNull();

    const token = withGitHubOwnerV1(
      { email: "person@example.com" },
      { provider: "github", providerAccountId: "123456" }
    );
    expect(token.ownerId).toBe("github:123456");
  });

  it("projects only approved display fields and never leaks OAuth tokens", () => {
    const inputSession: Session = {
      expires: "2099-01-01T00:00:00.000Z",
      user: { ownerId: "github:123456", name: "Octo User" },
    };
    const token: JWT = {
      ownerId: "github:123456",
      name: "Octo User",
      email: "octo@example.com",
      picture: "https://avatars.githubusercontent.com/u/123456",
      access_token: "must-not-leak",
      refresh_token: "must-not-leak",
    };
    const projected = projectPublicSessionV1(inputSession, token);

    expect(projected).toEqual({
      expires: inputSession.expires,
      user: {
        ownerId: "github:123456",
        name: "Octo User",
        email: "octo@example.com",
        image: "https://avatars.githubusercontent.com/u/123456",
      },
    });
    expect(JSON.stringify(projected)).not.toMatch(/access_token|refresh_token|must-not-leak/);
    expect(authUserFromSessionV1(projected)).toEqual({
      ownerId: "github:123456",
      displayName: "Octo User",
      email: "octo@example.com",
      image: "https://avatars.githubusercontent.com/u/123456",
    });
  });

  it("rejects sessions without a valid provider-bound owner", () => {
    expect(authUserFromSessionV1(null)).toBeNull();
    expect(
      authUserFromSessionV1({
        expires: "2099-01-01T00:00:00.000Z",
        user: { ownerId: "email:octo@example.com" },
      })
    ).toBeNull();
  });
});

describe("Auth V1 NextAuth configuration", () => {
  it("uses one GitHub provider, JWT sessions, secure cookies, and same-origin redirects", () => {
    const resolution = resolveAuthEnvironmentV1(COMPLETE_ENVIRONMENT, "production");
    expect(resolution.status).toBe("READY");
    if (resolution.status !== "READY") return;

    const options = createAuthOptionsV1(resolution.environment);
    expect(options.providers.map(({ id }) => id)).toEqual(["github"]);
    expect(options.session?.strategy).toBe("jwt");
    expect(options.useSecureCookies).toBe(true);
    expect(options.secret).toBe(COMPLETE_ENVIRONMENT.NEXTAUTH_SECRET);
    expect(
      safeAuthRedirectV1("/saved", COMPLETE_ENVIRONMENT.NEXTAUTH_URL)
    ).toBe("https://aes.example/saved");
    expect(
      safeAuthRedirectV1(
        "https://attacker.example/steal",
        COMPLETE_ENVIRONMENT.NEXTAUTH_URL
      )
    ).toBe("https://aes.example/");
  });

  it("renders bounded signed-out and signed-in account controls", () => {
    const signedOut = renderToStaticMarkup(
      createElement(AccountControl, { authUser: null })
    );
    expect(signedOut).toContain("Sign in to save analyses");

    const signedIn = renderToStaticMarkup(
      createElement(AccountControl, {
        authUser: {
          ownerId: "github:123456",
          displayName: "Octo Test User",
          email: "octo@example.com",
          image: "https://avatars.githubusercontent.com/u/123456",
        },
      })
    );
    expect(signedIn).toContain("Octo Test User");
    expect(signedIn).toContain("Sign out");
    expect(signedIn).not.toContain("github:123456");
    expect(signedIn).not.toMatch(/access_token|refresh_token/i);
  });
});
