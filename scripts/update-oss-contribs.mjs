import { readFile, writeFile } from "node:fs/promises";

const USER = "barry166";
const MAX_REPOS = 6;
const MIN_STARS = 100;
const README = "README.md";
const START = "<!-- OSS:START -->";
const END = "<!-- OSS:END -->";

const query = `
  query($query: String!) {
    search(query: $query, type: ISSUE, first: 100) {
      nodes {
        ... on PullRequest {
          number
          url
          mergedAt
          repository {
            name
            nameWithOwner
            stargazerCount
            owner { login }
          }
        }
      }
    }
  }
`;

const token = process.env.GITHUB_TOKEN;

async function githubGraphql(searchQuery) {
  const headers = {
    "content-type": "application/json",
    "user-agent": "barry166-profile-updater",
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables: { query: searchQuery } }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  if (body.errors) {
    throw new Error(`GitHub API errors: ${JSON.stringify(body.errors)}`);
  }

  return body.data.search.nodes;
}

function starLabel(stars, repo) {
  if (repo === "fastify/fastify-cors") {
    return `Fastify official · ${stars} stars`;
  }

  if (stars >= 1000) {
    const value = Math.floor(stars / 100) / 10;
    return `${Number.isInteger(value) ? value.toFixed(0) : value}k stars`;
  }

  return `${stars} stars`;
}

function formatName(repo) {
  if (repo === "TencentCloud/CubeSandbox") return "CubeSandbox";
  if (repo === "fastify/fastify-cors") return "fastify-cors";
  if (repo === "presenton/presenton") return "Presenton";
  return repo.split("/")[1];
}

function render(prs) {
  const byRepo = new Map();

  for (const pr of prs) {
    if (!pr?.mergedAt) continue;
    if (pr.repository.owner.login === USER) continue;
    if (pr.repository.stargazerCount < MIN_STARS) continue;

    const repo = pr.repository.nameWithOwner;
    const existing = byRepo.get(repo);

    if (!existing || pr.repository.stargazerCount > existing.repository.stargazerCount) {
      byRepo.set(repo, pr);
    }
  }

  return [...byRepo.values()]
    .sort((a, b) => b.repository.stargazerCount - a.repository.stargazerCount)
    .slice(0, MAX_REPOS)
    .map((pr) => {
      const repo = pr.repository.nameWithOwner;
      return `- [${formatName(repo)}](${pr.url}) · ${starLabel(pr.repository.stargazerCount, repo)}`;
    })
    .join("\n");
}

async function main() {
  const prs = await githubGraphql(`author:${USER} is:pr is:merged archived:false`);
  const nextBlock = `${START}\n${render(prs)}\n${END}`;
  const readme = await readFile(README, "utf8");

  const start = readme.indexOf(START);
  const end = readme.indexOf(END);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing ${START}/${END} markers in ${README}`);
  }

  const next = `${readme.slice(0, start)}${nextBlock}${readme.slice(end + END.length)}`;

  if (next !== readme) {
    await writeFile(README, next);
  }
}

await main();
