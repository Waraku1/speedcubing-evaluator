import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CFOP Solver | Speedcubing Evaluator",
  description: "CFOPの段階別手順とEvaluator評価を確認するワークベンチ",
};

export default function SolverLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
