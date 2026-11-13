import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { cases } from "./p01-cases.mjs";
import { serveReference } from "./server.mjs";
import { replays } from "./p01-replays.mjs";
import { readJson, version, artifactDigest, digest, startBrowser, runVariant, requireCheck } from "./browser-evaluation.mjs";

const plan = await readJson("pilot/evaluator/P01.json");
const contract = await readJson("pilot/builder/P01.json");
const calibration = (await readJson("pilot/evaluator/calibration.json"))["dual-plates"].mutations;
const faultIds = calibration.map(fault => fault.id);
const args = process.argv.slice(2);
const getArg = name => args.find(arg => arg.startsWith(name + "="))?.slice(name.length + 1);
const selectedFault = getArg("--fault");
const selectedLayout = getArg("--layout");
const submission = getArg("--submission");
const replayPath = getArg("--replay");
const calibrate = args.includes("--calibrate");
if (args.some(arg => !/^--(calibrate$|(layout|fault|submission|replay)=.+)/.test(arg)) ||
    (selectedFault && (!faultIds.includes(selectedFault) || calibrate)) ||
    (selectedLayout && !Object.hasOwn(replays, selectedLayout)) ||
    Boolean(submission) !== Boolean(replayPath) ||
    (submission && (selectedFault || calibrate || selectedLayout))) {
  throw new Error("Use [--layout=reference|offset] [--fault=<id>|--calibrate] or --submission=<directory> --replay=<file>.");
}
const variants = calibrate ? ["", ...faultIds] : [selectedFault ?? ""];
const layouts = submission
  ? { submission: { ...JSON.parse(await readFile(replayPath, "utf8")), folder: resolve(submission) } }
  : selectedLayout ? { [selectedLayout]: replays[selectedLayout] } : replays;

const evaluatorFiles = ["scripts/evaluate-p01.mjs", "scripts/p01-cases.mjs", "scripts/server.mjs",
  "scripts/p01-replays.mjs", "scripts/browser-evaluation.mjs", "pilot/evaluator/P01.json", "pilot/builder/P01.json",
  "pilot/evaluator/calibration.json", "pilot/evaluator/run-report.schema.json", "package-lock.json"];
const evaluatorVersion = await version(evaluatorFiles);

function countGatePixels(bytes, [r, g, b]) {
  const frame = PNG.sync.read(bytes);
  let total = 0;
  for (let pixel = 0; pixel < frame.data.length; pixel += 4) {
    if (Math.abs(frame.data[pixel] - r) < 15 && Math.abs(frame.data[pixel + 1] - g) < 15 &&
        Math.abs(frame.data[pixel + 2] - b) < 15) total++;
  }
  return total;
}

const { browser, base } = await startBrowser();
try {
  for (const [layout, route] of Object.entries(layouts)) {
    const folder = resolve(route.folder);
    const artifactVersion = await artifactDigest(folder);
    const { folder: _folder, ...replay } = route;
    const runEvaluatorVersion = digest(evaluatorVersion + JSON.stringify(replay));
    const server = await serveReference(0, folder);
    try {
      const reports = [];
      for (const fault of variants) {
        reports.push(await runVariant(browser, base, {
          layout, route, fault, server, artifactVersion, evaluatorVersion: runEvaluatorVersion, plan, contract, cases,
          helpers: { gatePixels: countGatePixels },
          setup(initial) {
            requireCheck(!initial.door.unlocked && !initial.door.passable && !initial.goalCrossed &&
              initial.outcome === "none", "Local setup pre-completed the behavior.");
          },
        }));
      }
      if (!submission && variants.includes("") && reports[0].cases.some(row => row.status !== "pass")) {
        process.exitCode = 1;
      }
      if (calibrate) {
        for (const [i, fault] of calibration.entries()) {
          const outcomes = new Map(reports[i + 1].cases.map(row => [row.caseId, row.status]));
          for (const [expected, status] of [[fault.mustDetect, "fail"], [fault.mustPreserve, "pass"]]) {
            for (const id of expected) {
              if (outcomes.get(id) !== status) {
                console.error(layout, fault.id, id, "expected", status, "observed", outcomes.get(id));
                process.exitCode = 1;
              }
            }
          }
        }
      }
    } finally {
      await server.close();
    }
  }
} finally {
  await browser?.close();
}
