"use client";

import { createContext, useContext, type ReactNode } from "react";

const SavedAnalysisAuthContext = createContext(false);

export function SavedAnalysisAuthProvider({
  authenticated,
  children,
}: Readonly<{ authenticated: boolean; children: ReactNode }>) {
  return (
    <SavedAnalysisAuthContext.Provider value={authenticated}>
      {children}
    </SavedAnalysisAuthContext.Provider>
  );
}

export function useSavedAnalysisAuth(): boolean {
  return useContext(SavedAnalysisAuthContext);
}
