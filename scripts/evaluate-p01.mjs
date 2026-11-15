import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { cases } from "./p01-cases.mjs";
import { serveReference } from "./server.mjs";
import { replays, atomReplay, flatReplay } from "./p01-replays.mjs";
import { readJson, version, artifactDigest, digest, startBrowser, runVariant, requireCheck } from "./browser-evaluation.mjs";
import { contactCases } from "./plate-contact-cases.mjs";

const args = process.argv.slice(2);
const getArg = name => args.find(arg => arg.startsWith(name + "="))?.slice(name.length + 1);
const task = getArg("--task") ?? "P01";
if (!["A01", "A02", "C01", "C02", "P01", "P02"].includes(task)) throw new Error("Unknown pressure-plate task.");
const atom = task.startsWith("A");
const flat = task.endsWith("2");
const planPath = "pilot/evaluator/" + task + ".json";
const contractPath = "pilot/builder/" + task + ".json";
const plan = await readJson(planPath);
const contract = await readJson(contractPath);
const calibrations = (await readJson("pilot/evaluator/calibration.json"))["dual-plates"].mutations;
const atomFault = flat ? "nearby_crate_triggers_plate" : "projection_triggers_plate";
const atomCase = flat ? "no_contact_no_trigger" : "wrong_height";
const calibration = atom ? [{ id: atomFault, mustDetect: [atomCase], mustPreserve: ["plate_contact"] }] :
  calibrations.map(fault => ({ ...fault, mustDetect: fault.mustDetect.filter(id => plan.cases.some(entry => entry.id === id)) }));
const faultIds = calibration.map(fault => fault.id);
const selectedFault = getArg("--fault");
const selectedLayout = getArg("--layout");
const submission = getArg("--submission");
const replayPath = getArg("--replay");
const calibrate = args.includes("--calibrate");
const clock = getArg("--clock") ?? "real";
if (args.some(arg => !/^--(calibrate$|(layout|fault|submission|replay|task|clock)=.+)/.test(arg)) ||
    !["real", "virtual"].includes(clock) ||
    (selectedFault && (!faultIds.includes(selectedFault) || calibrate)) ||
    (selectedLayout && (task !== "P01" || !Object.hasOwn(replays, selectedLayout))) ||
    Boolean(submission) !== Boolean(replayPath) ||
    (submission && (selectedFault || calibrate || selectedLayout || !["P01", "P02"].includes(task)))) {
  throw new Error("Use [--task=A01|A02|C01|C02|P01|P02] [--layout=reference|offset] [--fault=<id>|--calibrate] or --submission=<directory> --replay=<file>. Optional --clock=real|virtual.");
}
const variants = calibrate ? ["", ...faultIds] : [selectedFault ?? ""];
const layouts = submission
  ? { submission: { ...JSON.parse(await readFile(replayPath, "utf8")), folder: resolve(submission) } }
  : flat ? { [task]: flatReplay } : atom ? { [task]: atomReplay } :
    task === "C01" ? { C01: replays.reference } :
      selectedLayout ? { [selectedLayout]: replays[selectedLayout] } : replays;

const evaluatorFiles = ["scripts/evaluate-p01.mjs", "scripts/p01-cases.mjs", "scripts/server.mjs",
  "scripts/p01-replays.mjs", "scripts/browser-evaluation.mjs", "scripts/plate-contact-cases.mjs", planPath, contractPath,
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
    const runEvaluatorVersion = digest(evaluatorVersion + JSON.stringify(replay) + clock);
    const server = await serveReference(0, folder);
    const url = new URL(server.url);
    if (!submission) url.searchParams.set("task", task);
    try {
      const reports = [];
      const gameVersion = !submission && task !== "P01" ? artifactVersion + "/" + task : artifactVersion;
      for (const fault of variants) {
        reports.push(await runVariant(browser, base, {
          layout, route, fault, replayClock: clock, server: { url: url.href }, artifactVersion: gameVersion,
          evaluatorVersion: runEvaluatorVersion, plan, contract, cases: { ...cases, ...contactCases },
          helpers: { gatePixels: countGatePixels },
          setup(initial) {
            if (atom) {
              requireCheck(!initial.plates.A.active, "Local scenario pre-activated A.");
              return;
            }
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
