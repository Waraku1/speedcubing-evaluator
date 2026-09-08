import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CubeLab — CFOP Workbench",
  description:
    "Inspect and solve Rubik's Cube scrambles phase by phase with a human-style CFOP solver.",
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
