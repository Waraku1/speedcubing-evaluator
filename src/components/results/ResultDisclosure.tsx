"use client";

import { useId, useState, type ReactNode } from "react";

import styles from "./results.module.css";

type ResultDisclosureProps = Readonly<{
  label: string;
  children: ReactNode;
}>;

export function ResultDisclosure({ label, children }: ResultDisclosureProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  return (
    <div className={styles.disclosure}>
      <button
        aria-controls={contentId}
        aria-expanded={expanded}
        className={styles.disclosureButton}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {expanded ? "Hide" : "Show"} {label}
      </button>
      {expanded ? (
        <div className={styles.disclosureContent} id={contentId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
