import { execFileSync } from "node:child_process";

const defaultBaseRef = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : "origin/main";

const baseRef = process.env.DB_MIGRATION_GUARD_BASE ?? defaultBaseRef;
const diffBase = resolveDiffBase(baseRef);
const changes = [
  ...parseNameStatus(git(["diff", "--name-status", `${diffBase}...HEAD`])),
  ...parseNameStatus(git(["diff", "--cached", "--name-status"])),
  ...parseNameStatus(git(["diff", "--name-status"])),
  ...git(["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => ({ status: "A", path })),
];

const schemaChanged = changes.some(
  (change) => change.path === "prisma/schema.prisma" && change.status !== "D",
);
const addedMigration = changes.some(
  (change) =>
    change.status === "A" && /^apps\/api\/src\/migrations\/\d{4}-.+\.ts$/.test(change.path),
);
const registryChanged = changes.some(
  (change) => change.path === "apps/api/src/migrations/index.ts",
);

if (schemaChanged && !addedMigration) {
  fail(
    "prisma/schema.prisma changed, but no new ordered migration file was added under apps/api/src/migrations/.",
  );
}

if (addedMigration && !registryChanged) {
  fail("A migration file was added, but apps/api/src/migrations/index.ts was not updated.");
}

console.log("Database migration guard passed.");

function resolveDiffBase(ref) {
  try {
    return git(["merge-base", ref, "HEAD"]).trim();
  } catch {
    return git(["rev-parse", "HEAD~1"]).trim();
  }
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function parseNameStatus(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...pathParts] = line.split(/\s+/);
      return { status, path: pathParts.at(-1) ?? "" };
    });
}

function fail(message) {
  console.error(`Database migration guard failed: ${message}`);
  console.error(
    "Any database schema change must refresh the explicit database version and provide an upgrade migration.",
  );
  process.exit(1);
}
