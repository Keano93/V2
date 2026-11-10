import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Headstart",
  description: "The expansion engine for B2B SaaS. Your product got better. Your customers don't know yet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#fafafa", color: "#111" }}>{children}</body>
    </html>
  );
}
