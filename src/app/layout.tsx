import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "HCA Speedcubing Evaluator",
  description: "Human-state Demand analysis for verified 3x3x3 cube solutions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
