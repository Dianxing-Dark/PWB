import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifactDigest, digest, readJson, runVariant, selectProfile, startBrowser, version } from "./browser-evaluation.mjs";
import { cases, checkSetup } from "./checkpoint-cases.mjs";
import { galleryReplay, terraceReplay } from "./checkpoint-replay.mjs";
import { serveReference } from "./server.mjs";

const tasks = ["A10", "C07", "C12"];
const args = process.argv.slice(2);
const selected = args.find(arg => arg.startsWith("--task="))?.slice(7);
const submission = args.find(arg => arg.startsWith("--submission="))?.slice(13);
const replay = args.find(arg => arg.startsWith("--replay="))?.slice(9);
const starter = args.includes("--starter");
const calibrate = args.includes("--calibrate");
const layout = args.find(arg => arg.startsWith("--layout="))?.slice(9);
const profile = args.find(arg => arg.startsWith("--profile="))?.slice(10);
if (args.some(arg => !/^--(calibrate$|starter$|(task|submission|replay|layout|profile)=.+)/.test(arg)) ||
    (selected && !tasks.includes(selected)) || Boolean(submission) !== Boolean(replay) ||
    (submission && (!selected || starter || calibrate || layout)) || (starter && (selected !== "C12" || calibrate || layout)) ||
    (profile && (!["A", "B", "C"].includes(profile) || starter || calibrate)) ||
    (layout && (layout !== "gallery" || calibrate))) {
  throw new Error("Use --task=A10|C07|C12 with optional --calibrate, --layout=gallery or --profile=A|B|C. For a submission add --submission=<directory> --replay=<file>. For the empty control use --task=C12 --starter.");
}
const { mutationsByTask } = (await readJson("pilot/evaluator/calibration.json")).checkpoints;
const route = submission ? JSON.parse(await readFile(replay, "utf8")) : layout ? galleryReplay : terraceReplay;
const reference = layout ? "references/checkpoints-turn" : "references/checkpoints";
const folder = resolve(submission ?? (starter ? "references/checkpoint-starter" : reference));
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
      const sourceVersion = await version([planFile, contractFile, "scripts/evaluate-checkpoints.mjs",
        "scripts/checkpoint-replay.mjs",
        "scripts/checkpoint-cases.mjs", "scripts/browser-evaluation.mjs", "scripts/server.mjs",
        "pilot/evaluator/run-report.schema.json", "pilot/evaluator/calibration.json", "package-lock.json"]);
      const url = new URL(server.url);
      if (!submission && !starter) url.searchParams.set("task", taskId);
      for (const mutation of [null, ...(calibrate ? mutationsByTask[taskId] : [])]) {
        const report = await runVariant(browser, base, {
          layout: submission ? "submission" : starter ? "C12-starter" : layout ? taskId + "-gallery" : taskId,
          route, fault: mutation?.id, replayClock: "virtual",
          server: { url: url.href }, artifactVersion: submission ? artifactVersion : artifactVersion + "/" + taskId,
          evaluatorVersion: digest(sourceVersion + JSON.stringify(route) + (profile ?? "C")), plan, contract, cases, profile,
          setup: (state, scenario) => checkSetup(state, scenario, route),
        });
        if (!mutation) {
          if (starter) {
            const [launch, probe, ...mechanics] = report.cases;
            if (launch.status !== "pass" || probe.status !== "fail" ||
                mechanics.some(row => row.status !== "product_blocked" || row.blockedBy !== "probe")) process.exitCode = 1;
          } else if (!submission && report.cases.some(row => row.status !== "pass")) process.exitCode = 1;
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
