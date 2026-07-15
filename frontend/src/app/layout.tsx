import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AgentForge - AI Agent Automation Dashboard",
  description: "Enterprise-grade orchestrator for autonomous OpenAI & Claude agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body className={`${inter.className} bg-slate-950 text-slate-100 h-full overflow-hidden antialiased`}>
        {children}
      </body>
    </html>
  );
}
