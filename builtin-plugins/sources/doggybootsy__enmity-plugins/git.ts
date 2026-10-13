import cp from "node:child_process";

const $ = (template: {
  raw: readonly string[] | ArrayLike<string>;
}, ...substitutions: any[]) => cp.execSync(String.raw(template, ...substitutions), { cwd: process.cwd() }).toString("binary").trim()

const git = (template: {
  raw: readonly string[] | ArrayLike<string>;
}, ...substitutions: any[]) => $`git ${String.raw(template, ...substitutions)}`;

export interface GitInfo {
  url: string,
  branch: string
}

export function extractGitInfo(): GitInfo {
  let url = "https://github.com/doggybootsy/enmity-plugins";
  let branch = "main";

  try {    
    url = git`config --get remote.origin.url`;
    if (url.endsWith(".git")) url = url.slice(0, -4);

    branch = git`rev-parse --abbrev-ref HEAD`;
  } finally {
    return { url, branch };
  }
}