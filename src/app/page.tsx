import { EvaluatorWorkbench } from "../components/workbench/EvaluatorWorkbench";
import { WorkbenchHeader } from "../components/workbench/WorkbenchHeader";
import { SavedAnalysisAuthProvider } from "../components/saved/SavedAnalysisAuthContext";
import { getAuthUserV1 } from "../lib/auth/getAuthUserV1";

export const dynamic = "force-dynamic";

export default async function Home() {
  const authUser = await getAuthUserV1();

  return (
    <>
      <a className="skip-link" href="#workbench-main">
        Skip to evaluator workbench
      </a>
      <WorkbenchHeader authUser={authUser} />
      <main className="app-main" id="workbench-main" tabIndex={-1}>
        <SavedAnalysisAuthProvider authenticated={authUser !== null}>
          <EvaluatorWorkbench />
        </SavedAnalysisAuthProvider>
      </main>
    </>
  );
}
