import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { readJson } from "./browser-evaluation.mjs";

const output = process.argv[2];
if (!output || process.argv.length !== 3) {
  throw new Error("Usage: node scripts/run-reference-suite.mjs <new-output-directory>. Set CHROME_PATH to choose the browser.");
}
const outputDir = resolve(output);
await mkdir(outputDir);
const manifest = await readJson("pilot/manifest.json");
const tasks = manifest.tasks.filter(task => task.implementation.referenceLayouts > 0);

function variants(task) {
  const base = ["--task=" + task.id];
  if (task.implementation.referenceLayouts === 1 || task.id === "P01") return [{ name: "primary", args: base }];
  const secondary = { "moving-platform": "curve", checkpoints: "gallery" }[task.family];
  if (!secondary || task.implementation.referenceLayouts !== 2) throw new Error("Missing replay variant for " + task.id);
  return [{ name: "primary", args: base }, { name: secondary, args: [...base, "--layout=" + secondary] }];
}

function run(script, args) {
  return new Promise((accept, reject) => {
    const processHandle = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const chunks = [];
    processHandle.stdout.on("data", chunk => chunks.push(chunk));
    processHandle.stderr.on("data", chunk => chunks.push(chunk));
    processHandle.once("error", reject);
    processHandle.once("close", (exitCode, signal) => accept({ exitCode, signal, log: Buffer.concat(chunks).toString() }));
  });
}

const status = { browserExecutable: process.env.CHROME_PATH ?? null, tasks: [] };
for (const task of tasks) {
  const entries = variants(task);
  for (const { name, args } of entries) {
    const expected = task.id === "P01" ? 2 : 1;
    const evaluator = task.implementation.evaluator;
    const { exitCode, signal, log } = await run(evaluator, args);
    const logPath = join(outputDir, task.id + "-" + name + ".log");
    await writeFile(logPath, log);
    const paths = [...log.matchAll(/^\S+ \{.*\} \d+ms (.+)$/gm)].map(match => join(match[1].trim(), "report.json"));
    const reports = await Promise.all(paths.map(async path => {
      const data = JSON.parse(await readFile(path, "utf8"));
      if (data.taskId !== task.id || data.recordKind !== "run") throw new Error("Unexpected run report " + path);
      return {
        path: relative(process.cwd(), path).replaceAll("\\", "/"),
        runId: data.runId,
        artifactVersion: data.artifactVersion,
        evaluatorVersion: data.evaluatorVersion,
        browserVersion: data.browserVersion,
        cases: data.cases.map(row => ({ caseId: row.caseId, status: row.status, reason: row.reason })),
        summary: data.summary,
      };
    }));
    status.tasks.push({ taskId: task.id, layout: name, expectedReports: expected, exitCode, signal,
      log: basename(logPath), reports });
    await writeFile(join(outputDir, "index.json"), JSON.stringify(status, null, 2) + "\n");
    console.log(task.id, name, "exit", exitCode, "reports", reports.length + "/" + expected);
    if (exitCode !== 0 || reports.length !== expected) process.exitCode = 1;
  }
}
