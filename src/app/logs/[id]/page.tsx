import type { Metadata } from "next";

import { ProcedureLogDetailView } from "../../../components/procedures/ProcedureLogDetailView";
import { WorkbenchHeader } from "../../../components/workbench/WorkbenchHeader";
import { getAuthUserV1 } from "../../../lib/auth/getAuthUserV1";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved procedure · AES",
  description: "View a stored verified AES move procedure.",
};

export default async function ProcedureLogPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const [authUser, { id }] = await Promise.all([getAuthUserV1(), params]);
  return (
    <>
      <a className="skip-link" href="#procedure-detail-main">
        Skip to saved procedure
      </a>
      <WorkbenchHeader authUser={authUser} callbackUrl={`/logs/${id}`} />
      <main className="app-main" id="procedure-detail-main" tabIndex={-1}>
        {authUser === null ? (
          <div className="app-error">
            <h2>Sign in to open this saved procedure</h2>
            <p>Saved procedures are private and owner-scoped.</p>
          </div>
        ) : (
          <ProcedureLogDetailView id={id} />
        )}
      </main>
    </>
  );
}
