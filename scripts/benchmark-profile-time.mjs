import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { readJson } from "./browser-evaluation.mjs";

const [output, ...taskIds] = process.argv.slice(2);
if (!output || !taskIds.length || taskIds.some(id => !["C09", "C12"].includes(id)) ||
    new Set(taskIds).size !== taskIds.length) {
  throw new Error("Usage: node scripts/benchmark-profile-time.mjs <new-output-directory> C09 C12");
}
const outputDir = resolve(output);
await mkdir(outputDir);
const { tasks } = await readJson("pilot/manifest.json");
const records = [];

for (const order of ["ABC", "BCA", "CAB"]) {
  for (const taskId of taskIds) {
    const { implementation } = tasks.find(task => task.id === taskId);
    for (const profile of order) {
      const started = performance.now();
      const { exitCode, log } = await new Promise((accept, reject) => {
        const child = spawn(process.execPath, [implementation.evaluator, "--task=" + taskId, "--profile=" + profile],
          { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        const chunks = [];
        child.stdout.on("data", chunk => chunks.push(chunk));
        child.stderr.on("data", chunk => chunks.push(chunk));
        child.once("error", reject);
        child.once("close", exitCode => accept({ exitCode, log: Buffer.concat(chunks).toString() }));
      });
      const wallMs = Math.round(performance.now() - started);
      const logPath = join(outputDir, [taskId, order, profile].join("-") + ".log");
      await writeFile(logPath, log);
      const match = log.match(/^\S+ \{.*\} \d+ms (.+)$/m);
      const reportPath = match ? join(match[1].trim(), "report.json") : null;
      const report = reportPath && JSON.parse(await readFile(reportPath, "utf8"));
      if (report && (report.profile !== profile || report.taskId !== taskId)) throw new Error("Unexpected report " + reportPath);
      const result = { taskId, order, profile, wallMs, exitCode, log: basename(logPath), reportPath };
      records.push(result);
      await writeFile(join(outputDir, "index.json"), JSON.stringify(records, null, 2) + "\n");
      console.log(taskId, order, profile, exitCode, wallMs + "ms");
      if (exitCode !== 0 || !report) process.exitCode = 1;
    }
  }
}
