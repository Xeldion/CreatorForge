import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "CreatorForge — YouTube Strategy & Analytics Platform",
  description:
    "Replace vidIQ + TubeBuddy with one platform. Content strategy, AI thumbnails, A/B testing, and analytics — connected.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-[hsl(var(--background))] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
