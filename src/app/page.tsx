import { EvaluatorWorkbench } from "../components/workbench/EvaluatorWorkbench";
import { WorkbenchHeader } from "../components/workbench/WorkbenchHeader";

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#workbench-main">
        Skip to evaluator workbench
      </a>
      <WorkbenchHeader />
      <main className="app-main" id="workbench-main">
        <EvaluatorWorkbench />
      </main>
    </>
  );
}
