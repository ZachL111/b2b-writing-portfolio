import type { Metadata } from "next";
import "./globals.css";

const githubPages = process.env.GITHUB_PAGES === "true";
const faviconPath = githubPages
  ? "/b2b-writing-portfolio/favicon.svg"
  : "/favicon.svg";

export const metadata: Metadata = {
  title: "Zach Lewis | B2B Technical Writer for Cloud, AI & Security",
  description:
    "Technical writing for enterprise SaaS, cloud, AI, cybersecurity, identity, data infrastructure, secrets management, and developer tools.",
  keywords: [
    "B2B technical writer",
    "cloud technical writing",
    "cybersecurity writer",
    "AI writer",
    "developer tools content",
    "AWS content writer",
  ],
  authors: [{ name: "Zach Lewis" }],
  creator: "Zach Lewis",
  metadataBase: new URL("https://zachl111.github.io/b2b-writing-portfolio/"),
  alternates: { canonical: "./" },
  openGraph: {
    title: "Zach Lewis | B2B Technical Writer",
    description:
      "Technically grounded content for cloud, AI, security, data, and developer products.",
    type: "website",
    url: "./",
    siteName: "Zach Lewis B2B Writing Portfolio",
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: faviconPath,
    shortcut: faviconPath,
  },
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
