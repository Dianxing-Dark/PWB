import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { digest, validateReport } from "./browser-evaluation.mjs";

const [indexPath, reviewIndexPath, ...extra] = process.argv.slice(2);
if (!indexPath || extra.length) {
  throw new Error("Usage: node scripts/summarize-paired-profiles.mjs <index.json> [visual-reviews.json]");
}
const json = async file => JSON.parse(await readFile(file, "utf8"));
const index = await json(indexPath);
const reviewPaths = reviewIndexPath ? await json(reviewIndexPath) : {};
const readReport = async (file, item, profile) => {
  const report = await json(file);
  validateReport(report);
  if (report.profile !== profile || report.taskId !== item.taskId || report.artifactVersion !== item.artifactVersion) {
    throw new Error("Report does not match the paired artifact: " + file);
  }
  return report;
};

const paired = await Promise.all(index.submissions.map(async item => {
  const profiles = {};
  for (const profile of ["A", "B", "C"]) {
    const run = item.profiles[profile];
    if (!run?.reportPath || run.exitCode !== 0) throw new Error(item.id + " has no completed profile " + profile);
    const raw = await readReport(run.reportPath, item, profile);
    const reviewed = reviewPaths[item.id]?.[profile];
    const report = reviewed ? await readReport(resolve(dirname(reviewIndexPath), reviewed), item, profile) : raw;
    if (reviewed && (report.runId !== raw.runId || !report.visualReviewDigest ||
        report.sourceRunReportDigest !== digest(await readFile(run.reportPath)))) {
      throw new Error(item.id + " review does not match profile " + profile);
    }
    const cases = new Map(report.casePlan.map(entry => [entry.id, entry]));
    profiles[profile] = {
      wallMs: run.wallMs,
      launchPassed: report.cases.find(row => row.caseId === "launch")?.status === "pass",
      strictTaskSuccess: report.summary.strictTaskSuccess,
      caseStatuses: Object.fromEntries(report.cases.map(row => [row.caseId, row.status])),
      verdicts: report.summary.stages,
      failures: report.cases.filter(row => row.status === "fail").map(row => ({
        caseId: row.caseId, stage: cases.get(row.caseId).stage, reason: row.reason,
      })),
    };
  }
  const compare = (left, right) => Object.entries(profiles[left].caseStatuses).flatMap(([id, status]) => {
    const other = profiles[right].caseStatuses[id];
    return other && status !== other ? [{ id, [left]: status, [right]: other }] : [];
  });
  const absent = profile => new Set(Object.keys(profiles[profile].caseStatuses));
  const missedByA = absent("A");
  const missedByB = absent("B");
  return {
    id: item.id, taskId: item.taskId, cohort: item.cohort ?? "unspecified", artifactVersion: item.artifactVersion, profiles,
    failuresOutsideA: profiles.C.failures.filter(row => !missedByA.has(row.caseId)),
    failuresOutsideB: profiles.C.failures.filter(row => !missedByB.has(row.caseId)),
    overlappingCaseDisagreements: [...compare("A", "C"), ...compare("B", "C")],
  };
}));

function median(values) {
  const sorted = values.toSorted((a, b) => a - b);
  if (!sorted.length) return null;
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
}

function summarize(group) {
  const profileSummary = profile => {
    const runs = group.map(item => item.profiles[profile]);
    return {
      submissionsWithFailure: runs.filter(run => run.failures.length > 0).length,
      submissionsWithUnverifiedCases: runs.filter(run => Object.values(run.caseStatuses).includes("unverified")).length,
      confirmedStrictSuccesses: profile === "C" ? runs.filter(run => run.strictTaskSuccess === true).length : null,
      unverifiedStrictVerdicts: profile === "C" ? runs.filter(run => run.strictTaskSuccess === null).length : null,
      medianWallMs: median(runs.map(run => run.wallMs)),
      medianLaunchPassedWallMs: median(runs.filter(run => run.launchPassed).map(run => run.wallMs)),
    };
  };
  return {
    submissions: group.length,
    profiles: Object.fromEntries(["A", "B", "C"].map(profile => [profile, profileSummary(profile)])),
    submissionsWithFailuresOutsideA: group.filter(item => item.failuresOutsideA.length).length,
    submissionsWithFailuresOutsideB: group.filter(item => item.failuresOutsideB.length).length,
    overlappingCaseDisagreements: group.reduce((total, item) => total + item.overlappingCaseDisagreements.length, 0),
  };
}

console.log(JSON.stringify({
  overall: summarize(paired),
  byCohort: Object.fromEntries([...Map.groupBy(paired, item => item.cohort)]
    .map(([cohort, items]) => [cohort, summarize(items)])),
  paired,
}, null, 2));
