import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

async function inventory(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...await inventory(root, relative));
    else files.push({ path: relative, regular: entry.isFile() });
  }
  return files;
}

async function checkArtifact(directory) {
  const root = await realpath(directory);
  if (!(await lstat(root)).isDirectory()) throw new Error("Artifact path must be a directory.");
  const entries = await inventory(root);
  entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const entry = entries.find(file => file.path === "index.html");
  const regular = entries.filter(file => file.regular);
  const unsupported = entries.filter(file => !file.regular).map(file => file.path);
  const files = [];
  let entryContent = null;
  for (const { path } of regular) {
    const bytes = await readFile(join(root, path));
    files.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    if (path === "index.html") entryContent = bytes.toString("utf8").replace(/^\uFEFF/, "").trim();
  }
  const cases = [
    { id: "regular_local_files", pass: unsupported.length === 0, unsupported },
    { id: "nonempty_entry", pass: Boolean(entry?.regular && entryContent) },
  ];
  return { recordKind: "package_preflight", version: 1, pass: cases.every(row => row.pass), cases, files };
}

const [directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length) throw new Error("Usage: node scripts/check-artifact.mjs <artifact-directory>");
try {
  const report = await checkArtifact(directory);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ recordKind: "package_preflight", version: 1, pass: false,
    cases: [{ id: "readable_package", pass: false, reason: error.message }], files: [] }, null, 2));
  process.exitCode = 1;
}
