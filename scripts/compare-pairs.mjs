import { readFile } from "node:fs/promises";

const json = async path => JSON.parse(await readFile(path, "utf8"));
const pairFile = new URL("../pilot/evaluator/matched-pairs.json", import.meta.url);
const { pairs } = await json(pairFile);
const args = process.argv.slice(2);
if (args.length !== pairs.length * 2) {
  throw new Error("Provide the run reports for A01 A02 C01 C02 P01 P02 in that order.");
}

const reports = await Promise.all(args.map(json));
function checkReport(report, taskId) {
  if (report.taskId !== taskId || report.recordKind !== "run") {
    throw new Error("Expected a run report for " + taskId);
  }
  const cases = new Map(report.cases.map(row => [row.caseId, row]));
  if (cases.size !== report.cases.length) throw new Error("Duplicate case in " + taskId);
  return cases;
}

const results = pairs.map((pair, i) => {
  const report3D = reports[2 * i];
  const report2D = reports[2 * i + 1];
  const cases3D = checkReport(report3D, pair["3d"]);
  const cases2D = checkReport(report2D, pair["2d"]);
  function status(cases, id) {
    const row = cases.get(id);
    if (!row) throw new Error("A registered paired case is missing: " + id);
    return row.status;
  }
  const shared = pair.common.map(id => ({ id, "3D": status(cases3D, id), "2D": status(cases2D, id) }));
  const specific = (pair.dimensionSpecific ?? []).map(id => {
    const in3D = cases3D.has(id);
    if (in3D === cases2D.has(id)) throw new Error("Expected one report with dimension-specific case " + id);
    return { id, dimension: in3D ? "3D" : "2D", status: status(in3D ? cases3D : cases2D, id) };
  });
  return {
    task3D: report3D.taskId, task2D: report2D.taskId,
    run3D: report3D.runId, run2D: report2D.runId,
    artifact3D: report3D.artifactVersion, artifact2D: report2D.artifactVersion,
    evaluator3D: report3D.evaluatorVersion, evaluator2D: report2D.evaluatorVersion,
    shared,
    bothPassed: shared.filter(row => row["3D"] === "pass" && row["2D"] === "pass").length,
    specific,
  };
});

console.log(JSON.stringify({
  method: "Paired verdicts for the preregistered common checks. Dimension-specific counterexamples are separate.",
  pairs: results,
}, null, 2));
