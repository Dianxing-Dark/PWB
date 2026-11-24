import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reportPlan } from "./evaluation-summary.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const json = async path => JSON.parse(await readFile(path, "utf8"));
const reportPaths = process.argv.slice(2);
if (!reportPaths.length) throw new Error("Provide one or more report.json paths.");
const stages = {
  A: new Set(["prerequisite", "functional"]),
  B: new Set(["prerequisite", "journey", "visual"]),
  C: new Set(["prerequisite", "functional", "journey", "visual"]),
};

async function compare(path) {
  const report = await json(path);
  if (report.profile && report.profile !== "C") throw new Error("Profile projections require a full run report: " + path);
  const legacy = report.casePlan ? null : await json(join(repo, "pilot", "evaluator", report.taskId + ".json"));
  const plan = reportPlan(report, legacy);
  const definitions = new Map(plan.cases.map(entry => [entry.id, entry]));
  const evidence = new Map(report.evidence.map(entry => [entry.id, entry]));
  const cases = await Promise.all(report.cases.map(async row => {
    const definition = definitions.get(row.caseId);
    if (!definition) throw new Error("Unknown case " + row.caseId);
    const trace = evidence.get(row.caseId + "/trace.json");
    const elapsedMs = trace ? (await json(join(dirname(path), trace.storagePath))).elapsedMs ?? null : null;
    return { ...row, stage: definition.stage, caseType: definition.caseType, elapsedMs };
  }));

  function count(rows) {
    return {
      scheduled: rows.length,
      passed: rows.filter(row => row.status === "pass").length,
      failed: rows.filter(row => row.status === "fail").map(row => row.caseId),
      blocked: rows.filter(row => row.status === "product_blocked").map(row => row.caseId),
      unverified: rows.filter(row => row.status === "unverified").map(row => row.caseId),
    };
  }

  function summarize(selected) {
    const counted = cases.filter(row => selected.has(row.stage));
    const executed = counted.filter(row => evidence.has(row.caseId + "/trace.json"));
    const outcomes = count(counted);
    return {
      ...outcomes,
      observedFailure: outcomes.failed.length > 0,
      estimatedCaseMs: executed.length && executed.every(row => row.elapsedMs !== null)
        ? executed.reduce((sum, row) => sum + row.elapsedMs, 0) : null,
    };
  }

  return {
    taskId: report.taskId,
    runId: report.runId,
    artifactVersion: report.artifactVersion,
    evaluatorVersion: report.evaluatorVersion,
    strictTaskSuccess: report.summary.strictTaskSuccess,
    functionalInterval: report.summary.functionalInterval,
    functionalCoverage: report.summary.functionalCoverage,
    functionalByCaseType: Object.fromEntries(["positive", "negative", "boundary", "recovery"].map(type =>
      [type, count(cases.filter(row => row.stage === "functional" && row.caseType === type))])),
    scriptedJourney: count(cases.filter(row => row.stage === "journey")),
    visual: count(cases.filter(row => row.stage === "visual")),
    completenessAndRecovery: count(cases.filter(row => row.stage === "prerequisite" ||
      (row.stage === "journey" && row.caseType === "recovery"))),
    profiles: Object.fromEntries(Object.entries(stages).map(([id, selected]) => [id, summarize(selected)])),
  };
}

const runs = await Promise.all(reportPaths.map(compare));
console.log(JSON.stringify({
  method: "Paired projection from the same full runs. Case times exclude browser startup and are estimates for standalone profiles.",
  runs,
}, null, 2));
