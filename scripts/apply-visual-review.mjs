import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { digest, readJson, validateReport } from "./browser-evaluation.mjs";
import { reportPlan, summarize } from "./evaluation-summary.mjs";

const [rawFile, reviewFile, outputFile, ...extra] = process.argv.slice(2);
if (!rawFile || !reviewFile || !outputFile || extra.length ||
    dirname(resolve(rawFile)) !== dirname(resolve(outputFile))) {
  throw new Error("Usage: node scripts/apply-visual-review.mjs <report.json> <review.json> <new-report-in-same-directory.json>");
}

const [rawBytes, reviewBytes] = await Promise.all([readFile(rawFile), readFile(reviewFile)]);
const report = JSON.parse(rawBytes);
const review = JSON.parse(reviewBytes);
validateReport(report);
if (report.recordKind !== "run" || report.visualReviewDigest ||
    review.reviewKind !== "manual_frame_review" || review.runReportDigest !== digest(rawBytes) ||
    !Array.isArray(review.checks) || !review.checks.length) {
  throw new Error("The review must refer to the immutable raw run report.");
}
const legacy = report.casePlan ? null : await readJson("pilot/evaluator/" + report.taskId + ".json");
const plan = reportPlan(report, legacy);
const frames = new Map(report.evidence.filter(entry => entry.evidenceType === "event_aligned_frame")
  .map(entry => [entry.id, entry]));
const reviewed = new Set();

for (const check of review.checks) {
  const index = report.cases.findIndex(row => row.caseId === check.caseId);
  if (index < 0 || reviewed.has(check.caseId) || plan.cases[index].stage !== "visual" ||
      report.cases[index].status !== "unverified" || !["pass", "fail", "unverified"].includes(check.status) ||
      typeof check.reason !== "string" || !check.reason.trim() ||
      !Array.isArray(check.evidenceRefs) || !check.evidenceRefs.length) {
    throw new Error("Invalid visual review for " + check.caseId);
  }

  const row = report.cases[index];
  for (const reference of check.evidenceRefs) {
    const frame = row.evidenceRefs.map(id => frames.get(id)).find(item =>
      item && (reference.path === item.storagePath || reference.path === "evidence/" + item.storagePath) &&
      reference.sha256 === item.contentDigest);
    if (!frame || digest(await readFile(resolve(dirname(rawFile), frame.storagePath))) !== frame.contentDigest) {
      throw new Error("Frame evidence is missing or does not match the run: " + reference.path);
    }
  }
  reviewed.add(check.caseId);
  row.status = check.status;
  row.reason = check.reason;
}

report.summary = summarize(plan, report.cases, report.profile);
report.visualReviewDigest = digest(reviewBytes);
report.sourceRunReportDigest = digest(rawBytes);
validateReport(report);
await writeFile(outputFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
