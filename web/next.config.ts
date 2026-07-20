import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "";
const isProjectSite = Boolean(repositoryName) && !repositoryName.endsWith(".github.io");
const pagesBasePath = process.env.GITHUB_PAGES === "true" && isProjectSite
  ? `/${repositoryName}`
  : "";

const nextConfig: NextConfig = {
  output: process.env.GITHUB_PAGES === "true" ? "export" : undefined,
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
