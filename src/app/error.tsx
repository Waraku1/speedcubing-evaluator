"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

type AppErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset(): void;
}>;

export default function AppError({ reset }: AppErrorProps) {
  const retryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <main className="app-main" id="workbench-main" tabIndex={-1}>
      <section
        aria-labelledby="app-error-heading"
        className="app-error"
        role="alert"
      >
        <h1 id="app-error-heading">Evaluator unavailable</h1>
        <p id="app-error-explanation">
          The evaluator could not display this page. No result was committed.
          You can retry safely or return to manual cube entry.
        </p>
        <div className="app-error-actions">
          <button
            aria-describedby="app-error-explanation"
            onClick={reset}
            ref={retryRef}
            type="button"
          >
            Retry evaluator
          </button>
          <Link href="/">Return to manual cube entry</Link>
        </div>
      </section>
    </main>
  );
}
