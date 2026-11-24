import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readJson, validateReport } from "./browser-evaluation.mjs";
import { reportPlan } from "./evaluation-summary.mjs";

const [file, ...extra] = process.argv.slice(2);
if (!file || extra.length) throw new Error("Usage: node scripts/summarize-experiment.mjs <experiment.json>");
const manifest = await readJson("pilot/manifest.json");
const tasks = new Map(manifest.tasks.map(task => [task.id, task]));
const experiment = JSON.parse(await readFile(file, "utf8"));
if (typeof experiment.configuration !== "string" || !experiment.configuration.trim() ||
    !Array.isArray(experiment.attempts) || !experiment.attempts.length) {
  throw new Error("Register the configuration and all planned attempts in the experiment manifest.");
}

const attempts = await Promise.all(experiment.attempts.map(async attempt => {
  const task = tasks.get(attempt.taskId);
  const hasReport = typeof attempt.report === "string" && Boolean(attempt.report.trim());
  const hasFailure = typeof attempt.failure === "string" && Boolean(attempt.failure.trim());
  if (!task || typeof attempt.id !== "string" || !attempt.id.trim() || hasReport === hasFailure) {
    throw new Error("Each attempt needs a unique ID, a valid task ID, and a report path or a delivery failure reason.");
  }
  if (!hasReport) return { task, id: attempt.id, failure: attempt.failure, strict: false, rows: [] };

  const report = JSON.parse(await readFile(resolve(dirname(file), attempt.report), "utf8"));
  validateReport(report);
  if (report.recordKind !== "run" || report.taskId !== task.id || (report.profile && report.profile !== "C")) {
    throw new Error("Expected a full run report for attempt " + attempt.id);
  }
  const legacy = report.casePlan ? null : await readJson("pilot/" + task.evaluator);
  const plan = reportPlan(report, legacy);
  return {
    task, id: attempt.id, strict: report.summary.strictTaskSuccess,
    rows: report.cases.map((row, index) => ({ ...row, stage: plan.cases[index].stage, family: plan.cases[index].family })),
  };
}));
if (new Set(attempts.map(attempt => attempt.id)).size !== attempts.length) throw new Error("Attempt IDs must be unique.");

function summarize(group) {
  const confirmed = group.filter(attempt => attempt.strict === true).length;
  const unverified = group.filter(attempt => attempt.strict === null).length;
  return {
    planned: group.length, evaluated: group.filter(attempt => attempt.rows.length).length,
    strictSuccesses: confirmed, unverified, strictSuccessRate: confirmed / group.length,
    deliveryFailures: group.filter(attempt => attempt.failure).length,
  };
}

const byTaskAttribute = key => {
  const groups = Map.groupBy(attempts, attempt => attempt.task[key]);
  return Object.fromEntries([...groups].map(([value, group]) => [value, summarize(group)]));
};
const failures = attempts.flatMap(attempt => attempt.rows.filter(row => row.status !== "pass").map(row => ({
  attemptId: attempt.id, taskId: attempt.task.id, tier: attempt.task.tier, mechanism: attempt.task.family,
  stage: row.stage, requirementFamily: row.family, caseId: row.caseId, status: row.status, reason: row.reason,
  ...(row.blockedBy ? { blockedBy: row.blockedBy } : {}),
  ...(row.firstUnmetMilestone ? { firstUnmetMilestone: row.firstUnmetMilestone } : {}),
})));
console.log(JSON.stringify({
  configuration: experiment.configuration,
  overall: summarize(attempts),
  byTier: byTaskAttribute("tier"), byDimension: byTaskAttribute("dimension"), byMechanism: byTaskAttribute("family"),
  verdictsByStage: Object.fromEntries([...Map.groupBy(attempts.flatMap(attempt => attempt.rows), row => row.stage)]
    .map(([stage, rows]) => [stage, Object.fromEntries(
      ["pass", "fail", "product_blocked", "unverified"].map(status => [status, rows.filter(row => row.status === status).length]))])),
  deliveryFailures: attempts.filter(attempt => attempt.failure)
    .map(attempt => ({ attemptId: attempt.id, taskId: attempt.task.id, reason: attempt.failure })),
  failures,
}, null, 2));
