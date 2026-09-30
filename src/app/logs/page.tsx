import type { Metadata } from "next";

import { ProcedureLogsManager } from "../../components/procedures/ProcedureLogsManager";
import { WorkbenchHeader } from "../../components/workbench/WorkbenchHeader";
import { getAuthUserV1 } from "../../lib/auth/getAuthUserV1";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved procedures · AES",
  description: "Open and manage private AES verified move procedures.",
};

export default async function ProcedureLogsPage() {
  const authUser = await getAuthUserV1();
  return (
    <>
      <a className="skip-link" href="#procedure-logs-main">
        Skip to saved procedures
      </a>
      <WorkbenchHeader authUser={authUser} callbackUrl="/logs" />
      <main className="app-main" id="procedure-logs-main" tabIndex={-1}>
        {authUser === null ? (
          <div className="app-error">
            <h2>Sign in to view saved procedures</h2>
            <p>
              Your private verified procedures are available only to your GitHub-authenticated AES account.
            </p>
          </div>
        ) : (
          <ProcedureLogsManager />
        )}
      </main>
    </>
  );
}
