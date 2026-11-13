import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serveReference } from "./server.mjs";
import { artifactDigest, digest, readJson, requireCheck, runVariant, startBrowser, version } from "./browser-evaluation.mjs";
import { cases } from "./platform-cases.mjs";
import { layouts } from "./platform-replays.mjs";

const tasks = ["A03", "C03", "P04"];
const args = process.argv.slice(2);
const selected = args.find(arg => arg.startsWith("--task="))?.slice(7);
const selectedFault = args.find(arg => arg.startsWith("--fault="))?.slice(8);
const selectedLayout = args.find(arg => arg.startsWith("--layout="))?.slice(9);
const layout = selectedLayout ?? "reference";
const submission = args.find(arg => arg.startsWith("--submission="))?.slice(13);
const replayPath = args.find(arg => arg.startsWith("--replay="))?.slice(9);
const calibrate = args.includes("--calibrate");
const { mutations, emptyControlChecks } = (await readJson("pilot/evaluator/calibration.json"))["moving-platform"];
const calibration = layout === "curve" ? [...mutations, emptyControlChecks] : mutations;
if (args.some(arg => !/^--(calibrate$|(task|fault|layout|submission|replay)=.+)/.test(arg)) ||
    (selected && !tasks.includes(selected)) ||
    !Object.hasOwn(layouts, layout) ||
    Boolean(submission) !== Boolean(replayPath) ||
    (submission && (selected !== "P04" || selectedLayout || selectedFault || calibrate)) ||
    (selectedFault && (calibrate || selected !== "P04" || !calibration.some(fault => fault.id === selectedFault)))) {
  throw new Error("Use --task=A03|C03|P04, --layout=reference|curve, --calibrate, or --task=P04 --submission=<directory> --replay=<file>.");
}

const { folder: gameFolder, ...referenceRoute } = layouts[layout];
const route = submission ? JSON.parse(await readFile(replayPath, "utf8")) : referenceRoute;
const folder = resolve(submission ?? gameFolder);
const artifactVersion = await artifactDigest(folder);
const { browser, base } = await startBrowser();
try {
  for (const taskId of selected ? [selected] : tasks) {
    const planFile = "pilot/evaluator/" + taskId + ".json";
    const contractFile = "pilot/builder/" + taskId + ".json";
    const plan = await readJson(planFile);
    const contract = await readJson(contractFile);
    const sourceVersion = await version([planFile, contractFile, "scripts/platform-cases.mjs",
      "scripts/evaluate-platform.mjs", "scripts/platform-replays.mjs", "scripts/browser-evaluation.mjs", "scripts/server.mjs",
      "pilot/evaluator/run-report.schema.json", "pilot/evaluator/calibration.json", "package-lock.json"]);
    const evaluatorVersion = digest(sourceVersion + JSON.stringify(route));
    const server = await serveReference(0, folder);
    try {
      const url = new URL(server.url);
      if (!submission) url.searchParams.set("task", taskId);
      const faults = calibrate && taskId === "P04" ? ["", ...calibration.map(fault => fault.id)] : [selectedFault ?? ""];
      for (const fault of faults) {
        const report = await runVariant(browser, base, {
          layout: submission ? "submission" : layout === "reference" ? taskId : taskId + "-curve", route,
          fault, server: { url: url.href }, artifactVersion: submission ? artifactVersion : artifactVersion + "/" + taskId,
          evaluatorVersion, plan, contract, cases,
          setup(state, scenario) {
            requireCheck(state.outcome === "none" && !state.cargoDelivered && state.avatar.supportSurface !== "lift",
              "Local scenario pre-completed the action.");
            if (scenario === "adjacent_low_ledge") requireCheck(state.avatar.supportSurface === "lower",
              "The no-carry scenario did not begin on a stationary dock.");
          },
        });
        if (!submission && !fault && report.cases.some(row => row.status !== "pass")) process.exitCode = 1;
        if (calibrate && fault) {
          const target = calibration.find(item => item.id === fault);
          const outcomes = new Map(report.cases.map(row => [row.caseId, row.status]));
          for (const [ids, status] of [[target.mustDetect, "fail"], [target.mustPreserve, "pass"]]) {
            for (const id of ids) {
              if (outcomes.get(id) === status) continue;
              console.error(taskId, fault, id, "expected", status, "observed", outcomes.get(id));
              process.exitCode = 1;
            }
          }
        }
      }
    } finally {
      await server.close();
    }
  }
} finally {
  await browser.close();
}
