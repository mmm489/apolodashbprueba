import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type VercelProject = {
  id: string;
  name: string;
};

type VercelEnvVar = {
  id: string;
  key: string;
  value?: string;
  target?: string | string[];
};

const DEFAULT_OLD_PROJECT = "apolodash";
const DB_ENV_KEYS = [
  "DASHBOARD_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NO_SSL",
];

function usage() {
  console.log(`
Usage:
  tsx scripts/pull-old-dashboard-env.ts

Required env:
  VERCEL_TOKEN              temporary Vercel token with access to the old dashboard project

Optional env:
  OLD_VERCEL_PROJECT        defaults to ${DEFAULT_OLD_PROJECT}
  VERCEL_TEAM_ID            team id when the project is in a Vercel team

Result:
  Writes OLD_DASHBOARD_DATABASE_URL into .env.local without printing the secret.
`);
}

function loadDotenvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt < 1) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(equalsAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  loadDotenvFile(resolve(process.cwd(), ".env.local"));
  loadDotenvFile(resolve(process.cwd(), ".env"));
}

function updateEnvFile(filePath: string, key: string, value: string) {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (line.match(new RegExp(`^\\s*${key}\\s*=`))) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");
    nextLines.push(`${key}=${value}`);
  }
  writeFileSync(filePath, `${nextLines.join("\n").replace(/\n+$/u, "")}\n`);
}

function vercelUrl(path: string, teamId?: string) {
  const url = new URL(path, "https://api.vercel.com");
  if (teamId) url.searchParams.set("teamId", teamId);
  return url;
}

async function vercelGet<T>(path: string, token: string, teamId?: string, extraParams?: Record<string, string>) {
  const url = vercelUrl(path, teamId);
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Vercel API ${response.status}: ${message}`);
  }
  return (await response.json()) as T;
}

async function readDecryptedEnvValue(projectId: string, envId: string, token: string, teamId?: string) {
  const detail = await vercelGet<VercelEnvVar>(
    `/v1/projects/${projectId}/env/${envId}`,
    token,
    teamId,
  );
  return detail.value ?? "";
}

function envTargetsProduction(envVar: VercelEnvVar) {
  if (!envVar.target) return true;
  if (Array.isArray(envVar.target)) return envVar.target.includes("production");
  return envVar.target === "production";
}

async function main() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const oldProjectName = process.env.OLD_VERCEL_PROJECT ?? DEFAULT_OLD_PROJECT;
  if (!token) {
    throw new Error("Falta VERCEL_TOKEN. Pon un token temporal en .env.local o en el entorno.");
  }

  const projectsResponse = await vercelGet<{ projects: VercelProject[] }>(
    "/v9/projects",
    token,
    teamId,
    { limit: "100" },
  );
  const project = projectsResponse.projects.find((candidate) => candidate.name === oldProjectName);
  if (!project) {
    const names = projectsResponse.projects.map((candidate) => candidate.name).sort().join(", ");
    throw new Error(`No encuentro el proyecto viejo "${oldProjectName}". Proyectos visibles: ${names}`);
  }

  const envResponse = await vercelGet<{ envs: VercelEnvVar[] }>(
    `/v9/projects/${project.id}/env`,
    token,
    teamId,
  );
  let candidate: { key: string; value: string } | null = null;
  for (const key of DB_ENV_KEYS) {
    const envVar = envResponse.envs.find((entry) => entry.key === key && envTargetsProduction(entry));
    if (!envVar) continue;
    const value = await readDecryptedEnvValue(project.id, envVar.id, token, teamId);
    if (value.startsWith("postgresql://") || value.startsWith("postgres://")) {
      candidate = { key, value };
      break;
    }
  }

  if (!candidate) {
    const keys = envResponse.envs.map((envVar) => envVar.key).sort().join(", ");
    throw new Error(`No encuentro una variable de BD conocida en "${oldProjectName}". Variables visibles: ${keys}`);
  }

  updateEnvFile(resolve(process.cwd(), ".env.local"), "OLD_DASHBOARD_DATABASE_URL", candidate.value);
  console.log(`OK: OLD_DASHBOARD_DATABASE_URL actualizada desde ${oldProjectName}.${candidate.key}. Valor oculto.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
