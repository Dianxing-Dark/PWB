import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { readJson, validateReport } from "./browser-evaluation.mjs";

const [manifestFile, output, ...extra] = process.argv.slice(2);
if (!manifestFile || !output || extra.length) {
  throw new Error("Usage: node scripts/run-paired-profiles.mjs <submissions.json> <new-output-directory>");
}
const source = dirname(resolve(manifestFile));
const submissions = JSON.parse(await readFile(manifestFile, "utf8"));
const { tasks } = await readJson("pilot/manifest.json");
const taskById = new Map(tasks.map(task => [task.id, task]));
if (!Array.isArray(submissions) || !submissions.length ||
    new Set(submissions.map(row => row.id)).size !== submissions.length ||
    submissions.some(row => !/^[a-zA-Z0-9_-]+$/.test(row.id) || !taskById.has(row.taskId) ||
      typeof row.artifact !== "string" || typeof row.replay !== "string")) {
  throw new Error("Register unique IDs, task IDs, artifact directories and review replay paths.");
}
const outputDir = resolve(output);
await mkdir(outputDir);

function run(script, args) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const chunks = [];
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.on("data", chunk => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", exitCode => accept({ exitCode, log: Buffer.concat(chunks).toString() }));
  });
}

const index = { method: "Standalone runs on each frozen artifact with rotated profile order", submissions: [] };
for (const [i, item] of submissions.entries()) {
  const { implementation } = taskById.get(item.taskId);
  const artifact = resolve(source, item.artifact);
  const replay = resolve(source, item.replay);
  const group = { ...item, artifact, replay, order: ["ABC", "BCA", "CAB"][i % 3], profiles: {} };
  index.submissions.push(group);
  for (const profile of group.order) {
    const args = ["--task=" + item.taskId, "--submission=" + artifact, "--replay=" + replay, "--profile=" + profile];
    if (implementation.evaluator === "scripts/evaluate-p01.mjs") args.push("--clock=virtual");
    const started = performance.now();
    const { exitCode, log } = await run(implementation.evaluator, args);
    const wallMs = Math.round(performance.now() - started);
    const logFile = join(outputDir, item.id + "-" + profile + ".log");
    await writeFile(logFile, log);
    const matches = [...log.matchAll(/^\S+ \{.*\} \d+ms (.+)$/gm)];
    const reportPath = matches.length === 1 ? join(matches[0][1].trim(), "report.json") : null;
    if (reportPath) {
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      validateReport(report);
      if (report.taskId !== item.taskId || report.profile !== profile ||
          (group.artifactVersion && group.artifactVersion !== report.artifactVersion)) {
        throw new Error("Paired run changed the task, profile or artifact: " + reportPath);
      }
      group.artifactVersion = report.artifactVersion;
    }
    group.profiles[profile] = { exitCode, wallMs, logFile, reportPath };
    await writeFile(join(outputDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
    console.log(item.id, profile, exitCode, wallMs + "ms", reportPath ?? "missing report");
    if (exitCode !== 0 || !reportPath) process.exitCode = 1;
  }
}
