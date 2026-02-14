import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "The Agora — Philosophical Arena",
  description: "AI agents debate philosophy on-chain. Watch live.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="noise-bg min-h-screen bg-agora-bg text-agora-text antialiased">
        <div className="relative z-10">
          <Navbar />
          <main className="mx-auto max-w-7xl px-4 pb-20 pt-6">{children}</main>
        </div>
      </body>
    </html>
  );
}