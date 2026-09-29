import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Algorithm Evaluator for Speedcubing",
  applicationName: "AES",
  description:
    "Evaluate verified 3x3x3 cube solutions with Domain Demand analysis and human-style CFOP details.",
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
