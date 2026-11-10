import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Headstart",
  description: "The expansion engine for B2B SaaS. Your product got better. Your customers don't know yet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/" className="wordmark" aria-label="Headstart home">
            <span className="wordmark-mark" aria-hidden />
            Headstart
          </a>
          <nav className="nav" aria-label="Main">
            <a href="/" aria-current="page">Overview</a>
            <span className="soon" title="Phase 3">Accounts<small>soon</small></span>
            <span className="soon" title="Phase 5">Product<small>soon</small></span>
          </nav>
          <div className="topbar-right">Lumio · demo workspace</div>
        </header>
        {children}
      </body>
    </html>
  );
}
