import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serveReference } from "./server.mjs";
import { artifactDigest, digest, readJson, runVariant, selectProfile, startBrowser, version } from "./browser-evaluation.mjs";
import { cases, checkSetup } from "./keys-cases.mjs";

const tasks = ["A06", "C05", "P05"];
const args = process.argv.slice(2);
const selected = args.find(arg => arg.startsWith("--task="))?.slice(7);
const selectedFault = args.find(arg => arg.startsWith("--fault="))?.slice(8);
const submission = args.find(arg => arg.startsWith("--submission="))?.slice(13);
const replayPath = args.find(arg => arg.startsWith("--replay="))?.slice(9);
const calibrate = args.includes("--calibrate");
const profile = args.find(arg => arg.startsWith("--profile="))?.slice(10);
const { mutations, atomMutations, emptyControlChecks } = (await readJson("pilot/evaluator/calibration.json"))["keys-and-resources"];
const controlsByTask = { A06: atomMutations, C05: [], P05: [...mutations, emptyControlChecks] };
if (args.some(arg => !/^--(calibrate$|(task|fault|submission|replay|profile)=.+)/.test(arg)) ||
    (selected && !tasks.includes(selected)) || (profile && (selectedFault || calibrate)) ||
    Boolean(submission) !== Boolean(replayPath) ||
    (submission && (!selected || selectedFault || calibrate)) ||
    (selectedFault && (calibrate || !controlsByTask[selected]?.some(fault => fault.id === selectedFault)))) {
  throw new Error("Use --task=A06|C05|P05, --calibrate, --task=<id> --fault=<registered fault>, or --task=<id> --submission=<directory> --replay=<file>. Optional --profile=A|B|C.");
}

const gate = { axis: 0, plane: 1, direction: 1, before: [0.3, 0], after: [1.65, 0] };
const route = {
  probe: "d", lowerHeight: 0, upperHeight: 2.25, maxStep: 0.083, tolerance: 0.075,
  noKeyBranch: "lower",
  gates: { lower: gate, upper: gate },
  bypassApproaches: [-0.8, 0.8].map(z => ({ before: [gate.before[0], z], after: [gate.after[0], z] })),
  localPositions: {
    one_key_at_matching_lock: [0.3, 0.65],
    projected_near_other_floor: gate.before,
    key_already_spent_elsewhere: gate.before,
    before_amber_pickup: [-1.53, 0],
    blue_only_near_upper_lock: gate.before,
    amber_key_near_upper_lock: gate.before,
    no_key_near_locked_door: gate.before,
  },
  keys: { amber: [-0.95, 2.25, 0], blue: [-2.5, 0, 0] },
  feedback: { amberLabel: "#amber", lockLabel: "#upper", keyColor: [255, 221, 44], lockColor: [216, 121, 49] },
  journeys: {
    upper: { toKey: [[-4.82, -2.8], [-1.52, -2.8], [-1.52, 0]], afterGate: [], exit: [2.85, 0], exitRadius: 0.3 },
    lower: { toKey: [], afterGate: [], exit: [5.95, 0], exitRadius: 0.72 },
  },
};
const sharedExitRoute = {
  ...route,
  journeys: {
    ...route.journeys,
    upper: { ...route.journeys.upper, afterGate: [[3.21, -2.8], [5.95, -2.8]], exit: [5.95, 0], exitRadius: 0.72 },
  },
};
const submissionRoute = submission ? JSON.parse(await readFile(replayPath, "utf8")) : null;
const folder = resolve(submission ?? "references/keys");
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
      const source = await version([planFile, contractFile, "scripts/keys-cases.mjs",
        "scripts/evaluate-keys.mjs", "scripts/browser-evaluation.mjs", "scripts/server.mjs",
        "pilot/evaluator/run-report.schema.json", "pilot/evaluator/calibration.json", "package-lock.json"]);
      const replay = submissionRoute ?? (taskId === "P05" ? sharedExitRoute : route);
      const evaluatorVersion = digest(source + JSON.stringify(replay) + (profile ?? "C"));
      const url = new URL(server.url);
      if (!submission) url.searchParams.set("task", taskId);
      const controls = controlsByTask[taskId];
      const faults = calibrate ? ["", ...controls.map(fault => fault.id)] : [selectedFault ?? ""];
      for (const fault of faults) {
        const report = await runVariant(browser, base, {
          artifactDirectory: folder,
          layout: submission ? "submission" : taskId, route: replay, fault, server: { url: url.href },
          artifactVersion: submission ? artifactVersion : artifactVersion + "/" + taskId,
          evaluatorVersion, plan, contract, cases, profile, setup: (state, scenario) => checkSetup(state, scenario, replay),
        });
        if (!submission && !fault && report.cases.some(row => row.status !== "pass")) process.exitCode = 1;
        if (!calibrate || !fault) continue;
        const target = controls.find(item => item.id === fault);
        const outcomes = new Map(report.cases.map(row => [row.caseId, row.status]));
        for (const [ids, status] of [[target.mustDetect, "fail"], [target.mustPreserve, "pass"]]) {
          for (const id of ids) {
            if (outcomes.get(id) === status) continue;
            console.error(taskId, fault, id, "expected", status, "observed", outcomes.get(id));
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
