import type { Metadata } from "next";

import { SavedAnalysesManager } from "../../components/saved/SavedAnalysesManager";
import { SavedPageHeader } from "../../components/saved/SavedPageHeader";
import { getAuthUserV1 } from "../../lib/auth/getAuthUserV1";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved analyses · AES",
  description: "Open and manage private AES analysis snapshots.",
};

export default async function SavedAnalysesPage() {
  const authUser = await getAuthUserV1();
  return (
    <>
      <a className="skip-link" href="#saved-main">Skip to saved analyses</a>
      <SavedPageHeader authUser={authUser} />
      <main className="app-main" id="saved-main" tabIndex={-1}>
        {authUser === null ? (
          <div className="app-error">
            <h2>Sign in to view saved analyses</h2>
            <p>Your private saved snapshots are available only to your GitHub-authenticated AES account.</p>
          </div>
        ) : (
          <SavedAnalysesManager />
        )}
      </main>
    </>
  );
}
