import { checkArtifact } from "./artifact-preflight.mjs";

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
