"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Arena", href: "/" },
  { label: "Agents", href: "/agents" },
  { label: "Chronicle", href: "/chronicle" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-agora-border bg-agora-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-agora-gold to-amber-700" />
          <span className="font-display text-xl font-bold tracking-tight">
            The Agora
          </span>
        </Link>

        <div className="flex gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-agora-surface text-agora-text"
                    : "text-agora-textSecondary hover:bg-agora-surface hover:text-agora-text"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}