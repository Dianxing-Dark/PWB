import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifactDigest, digest, readJson, runVariant, selectProfile, startBrowser, version } from "./browser-evaluation.mjs";
import { cases, checkSetup, replays } from "./workshop-cases.mjs";
import { serveReference } from "./server.mjs";

const tasks = Object.keys(replays);
const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith("--" + name + "="))?.slice(name.length + 3);
const selected = value("task");
const profile = value("profile");
const submission = value("submission");
const replayFile = value("replay");
const calibrate = args.includes("--calibrate");
if (args.some(arg => !/^--(calibrate$|(task|profile|submission|replay)=.+)/.test(arg)) ||
    (selected && !tasks.includes(selected)) || (profile && (!["A", "B", "C"].includes(profile) || calibrate)) ||
    Boolean(submission) !== Boolean(replayFile) || (submission && (calibrate || !selected))) {
  throw new Error("Choose A07, C06 or C10 with --task. Optional --calibrate or --profile=A|B|C. For a submission supply --task, --submission and --replay.");
}
const replay = replayFile && JSON.parse((await readFile(replayFile, "utf8")).replace(/^\uFEFF/, ""));
const { mutationsByTask } = (await readJson("pilot/evaluator/calibration.json")).workshop;
const folder = resolve(submission ?? "references/workshop");
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
      const route = replay || replays[taskId];
      const source = await version([planFile, contractFile, "scripts/evaluate-workshop.mjs",
        "scripts/workshop-cases.mjs", "scripts/browser-evaluation.mjs", "scripts/server.mjs",
        "pilot/evaluator/run-report.schema.json", "pilot/evaluator/calibration.json", "package-lock.json"]);
      const url = new URL(server.url);
      if (!submission) url.searchParams.set("task", taskId);
      for (const mutation of [null, ...(calibrate ? mutationsByTask[taskId] : [])]) {
        const report = await runVariant(browser, base, {
          layout: submission ? "submission" : taskId, route, fault: mutation?.id, server: { url: url.href },
          replayClock: "virtual", artifactVersion: submission ? artifactVersion : artifactVersion + "/" + taskId,
          evaluatorVersion: digest(source + JSON.stringify(route) + (profile ?? "C")), plan, contract, cases, profile,
          setup: (state, scenario) => checkSetup(state, scenario, route), helpers: { submission: Boolean(submission) },
        });
        if (!mutation) {
          if (!submission && report.cases.some(row => row.status !== "pass")) process.exitCode = 1;
          continue;
        }
        for (const row of report.cases) {
          const expected = mutation.mustDetect.includes(row.caseId) ? "fail" : "pass";
          if (row.status !== expected) {
            console.error(taskId, mutation.id, row.caseId, "expected", expected, "observed", row.status);
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
