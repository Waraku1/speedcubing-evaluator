import type { Metadata } from "next";

import { SavedAnalysisDetailView } from "../../../components/saved/SavedAnalysisDetailView";
import { SavedPageHeader } from "../../../components/saved/SavedPageHeader";
import { getAuthUserV1 } from "../../../lib/auth/getAuthUserV1";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved analysis snapshot · AES",
  description: "View an immutable saved AES analysis snapshot.",
};

export default async function SavedAnalysisPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const [authUser, { id }] = await Promise.all([getAuthUserV1(), params]);
  return (
    <>
      <a className="skip-link" href="#saved-detail-main">Skip to saved snapshot</a>
      <SavedPageHeader authUser={authUser} callbackUrl={`/saved/${id}`} />
      <main className="app-main" id="saved-detail-main" tabIndex={-1}>
        {authUser === null ? (
          <div className="app-error">
            <h2>Sign in to open this saved analysis</h2>
            <p>Saved records are private and owner-scoped.</p>
          </div>
        ) : (
          <SavedAnalysisDetailView id={id} />
        )}
      </main>
    </>
  );
}
