import { resolve } from "node:path";
import { artifactDigest, digest, readJson, runVariant, selectProfile, startBrowser, version } from "./browser-evaluation.mjs";
import { cases, checkSetup } from "./spatial-pickup-cases.mjs";
import { serveReference } from "./server.mjs";

const tasks = ["A05", "C09"];
const args = process.argv.slice(2);
const selected = args.find(arg => arg.startsWith("--task="))?.slice(7);
const calibrate = args.includes("--calibrate");
const profile = args.find(arg => arg.startsWith("--profile="))?.slice(10);
if (args.some(arg => !/^--(calibrate$|task=.+|profile=.+)/.test(arg)) || (selected && !tasks.includes(selected)) ||
    (profile && (!["A", "B", "C"].includes(profile) || calibrate))) {
  throw new Error("Use --task=A05|C09 with optional --calibrate or --profile=A|B|C.");
}
const { mutationsByTask } = (await readJson("pilot/evaluator/calibration.json"))["spatial-pickup"];
const folder = resolve("references/spatial-pickup");
const artifactVersion = await artifactDigest(folder);
const { browser, base } = await startBrowser();
try {
  const server = await serveReference(0, folder);
  try {
    for (const taskId of selected ? [selected] : tasks) {
      const planFile = "pilot/evaluator/" + taskId + ".json";
      const contractFile = "pilot/builder/" + taskId + ".json";
      const plan = selectProfile(await readJson(planFile), profile);
      const contract = await readJson(contractFile);
      const evaluatorVersion = await version([planFile, contractFile, "scripts/evaluate-spatial-pickup.mjs",
        "scripts/spatial-pickup-cases.mjs", "scripts/browser-evaluation.mjs", "scripts/server.mjs",
        "pilot/evaluator/run-report.schema.json", "pilot/evaluator/calibration.json", "package-lock.json"]);
      const url = new URL(server.url);
      url.searchParams.set("task", taskId);
      for (const mutation of [null, ...(calibrate ? mutationsByTask[taskId] : [])]) {
        const report = await runVariant(browser, base, {
          layout: taskId, route: { tolerance: 0.075 }, fault: mutation?.id, server: { url: url.href },
          artifactVersion: artifactVersion + "/" + taskId, evaluatorVersion: digest(evaluatorVersion + (profile ?? "C")),
          plan, contract, cases, setup: checkSetup, profile,
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
