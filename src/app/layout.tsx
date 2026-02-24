import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Themblr",
  description: "AI theme generator for Tumblr starter themes",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
