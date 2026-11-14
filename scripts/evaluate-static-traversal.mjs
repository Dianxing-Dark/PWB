import { resolve } from "node:path";
import { artifactDigest, readJson, runVariant, startBrowser, version } from "./browser-evaluation.mjs";
import { cases, checkSetup } from "./static-traversal-cases.mjs";
import { serveReference } from "./server.mjs";

const tasks = ["A04", "A09"];
const args = process.argv.slice(2);
const selected = args.find(arg => arg.startsWith("--task="))?.slice(7);
const calibrate = args.includes("--calibrate");
if (args.some(arg => !/^--(calibrate$|task=.+)/.test(arg)) || (selected && !tasks.includes(selected))) {
  throw new Error("Use --task=A04|A09 and optionally --calibrate.");
}
const { mutationsByTask } = (await readJson("pilot/evaluator/calibration.json"))["static-traversal"];
const folder = resolve("references/static-traversal");
const artifactVersion = await artifactDigest(folder);
const { browser, base } = await startBrowser();
try {
  const server = await serveReference(0, folder);
  try {
    for (const taskId of selected ? [selected] : tasks) {
      const planFile = "pilot/evaluator/" + taskId + ".json";
      const contractFile = "pilot/builder/" + taskId + ".json";
      const plan = await readJson(planFile);
      const contract = await readJson(contractFile);
      const evaluatorVersion = await version([planFile, contractFile, "scripts/evaluate-static-traversal.mjs",
        "scripts/static-traversal-cases.mjs", "scripts/browser-evaluation.mjs", "scripts/server.mjs",
        "pilot/evaluator/run-report.schema.json", "pilot/evaluator/calibration.json", "package-lock.json"]);
      const url = new URL(server.url);
      url.searchParams.set("task", taskId);
      for (const mutation of [null, ...(calibrate ? mutationsByTask[taskId] : [])]) {
        const report = await runVariant(browser, base, {
          layout: taskId, route: { tolerance: 0.075 }, fault: mutation?.id, server: { url: url.href },
          artifactVersion: artifactVersion + "/" + taskId, evaluatorVersion, plan, contract, cases, setup: checkSetup,
        });
        if (!mutation) {
          if (report.cases.some(row => row.status !== "pass")) process.exitCode = 1;
          continue;
        }
        const statuses = new Map(report.cases.map(row => [row.caseId, row.status]));
        for (const [ids, expected] of [[mutation.mustDetect, "fail"], [mutation.mustPreserve, "pass"]]) {
          for (const id of ids) {
            if (statuses.get(id) === expected) continue;
            console.error(taskId, mutation.id, id, "expected", expected, "observed", statuses.get(id));
            process.exitCode = 1;
          }
        }
      }
    }
  } finally {
    await server.close();
  }
} finally {
  await browser.close();
}
