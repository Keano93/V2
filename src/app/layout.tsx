import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notice Guard",
  description: "Catch notifiable events on Irish construction projects before the notice window closes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IE">
      <body className="min-h-screen antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight text-slate-900">
              Notice Guard
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              <Link href="/projects" className="hover:text-slate-900">
                Projects
              </Link>
            </nav>
            <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              MVP · synthetic data only
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
