import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifactDigest, digest, readJson, runVariant, selectProfile, startBrowser, version } from "./browser-evaluation.mjs";
import { cases, checkSetup, primaryReplay } from "./line-of-fire-cases.mjs";
import { serveReference } from "./server.mjs";

const tasks = ["A08", "C08", "P06"];
const args = process.argv.slice(2);
const selected = args.find(arg => arg.startsWith("--task="))?.slice(7);
const calibrate = args.includes("--calibrate");
const profile = args.find(arg => arg.startsWith("--profile="))?.slice(10);
const submission = args.find(arg => arg.startsWith("--submission="))?.slice(13);
const replay = args.find(arg => arg.startsWith("--replay="))?.slice(9);
if (args.some(arg => !/^--(calibrate$|(task|profile|submission|replay)=.+)/.test(arg)) ||
    (selected && !tasks.includes(selected)) || Boolean(submission) !== Boolean(replay) ||
    (submission && (!selected || calibrate)) || (profile && calibrate)) {
  throw new Error("Use --task=A08|C08|P06 with optional --calibrate or --profile=A|B|C. For an external game supply --submission and --replay.");
}
const { mutationsByTask } = (await readJson("pilot/evaluator/calibration.json"))["line-of-fire"];
const folder = resolve(submission ?? "references/line-of-fire");
const route = submission ? JSON.parse((await readFile(replay, "utf8")).replace(/^\uFEFF/, "")) : primaryReplay;
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
      const evaluatorVersion = await version([planFile, contractFile, "scripts/evaluate-line-of-fire.mjs",
        "scripts/line-of-fire-cases.mjs", "scripts/browser-evaluation.mjs", "scripts/server.mjs",
        "pilot/evaluator/run-report.schema.json", "pilot/evaluator/calibration.json", "package-lock.json"]);
      const url = new URL(server.url);
      if (!submission) url.searchParams.set("task", taskId);
      for (const mutation of [null, ...(calibrate ? mutationsByTask[taskId] : [])]) {
        const report = await runVariant(browser, base, {
          artifactDirectory: folder,
          layout: submission ? "submission" : taskId, route, fault: mutation?.id, server: { url: url.href }, replayClock: "virtual",
          artifactVersion: submission ? artifactVersion : artifactVersion + "/" + taskId, evaluatorVersion: digest(evaluatorVersion + JSON.stringify(route) + (profile ?? "C")),
          plan, contract, cases, setup: (state, scenario) => checkSetup(state, scenario, route, contract), profile, helpers: { submission },
        });
        if (!mutation) {
          if (!submission && report.cases.some(row => row.status !== "pass")) process.exitCode = 1;
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
