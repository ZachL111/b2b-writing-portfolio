import type { NextConfig } from "next";

const githubPages = process.env.GITHUB_PAGES === "true";
const repositoryBasePath = "/b2b-writing-portfolio";

const nextConfig: NextConfig = {
  ...(githubPages
    ? {
        output: "export" as const,
        basePath: repositoryBasePath,
        assetPrefix: repositoryBasePath,
        trailingSlash: true,
        typescript: { tsconfigPath: "tsconfig.github.json" },
      }
    : {}),
  images: { unoptimized: true },
};

export default nextConfig;
