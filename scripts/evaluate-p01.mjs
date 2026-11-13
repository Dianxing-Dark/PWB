import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import Ajv2020 from "ajv/dist/2020.js";
import { cases, CheckFailure, requireCheck } from "./p01-cases.mjs";
import { serveReference } from "./server.mjs";

const readJson = async path => JSON.parse(await readFile(new URL("../" + path, import.meta.url), "utf8"));
const plan = await readJson("pilot/evaluator/P01.json");
const schema = await readJson("pilot/evaluator/run-report.schema.json");
const validate = new Ajv2020({ allErrors: true }).compile(schema);
const calibration = (await readJson("pilot/evaluator/calibration.json"))["dual-plates"].mutations;
const faultIds = calibration.map(fault => fault.id);
const args = process.argv.slice(2);
const faultFlag = args.find(arg => arg.startsWith("--fault="));
const selectedFault = faultFlag?.slice("--fault=".length);
if (args.some(arg => arg !== "--calibrate" && arg !== faultFlag) ||
    (faultFlag && !faultIds.includes(selectedFault)) || (faultFlag && args.includes("--calibrate"))) {
  throw new Error("Use --calibrate or --fault=<registered P01 fault>.");
}
const variants = args.includes("--calibrate") ? ["", ...faultIds] : [selectedFault ?? ""];

const executablePath = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(path => existsSync(path));
if (!executablePath) throw new Error("Set CHROME_PATH to an installed Chrome, Chromium, or Edge executable.");

const digest = data => createHash("sha256").update(data).digest("hex");
const referenceFiles = ["index.html", "style.css", "game.mjs", "simulation.mjs"];
const evaluatorFiles = ["scripts/evaluate-p01.mjs", "scripts/p01-cases.mjs", "scripts/server.mjs",
  "pilot/evaluator/P01.json", "pilot/evaluator/run-report.schema.json", "package-lock.json"];
async function version(paths) {
  const source = await Promise.all(paths.map(path => readFile(new URL("../" + path, import.meta.url))));
  return digest(source.map(digest).join(""));
}
const artifactVersion = await version(referenceFiles.map(file => "references/p01/" + file));
const evaluatorVersion = await version(evaluatorFiles);
const base = resolve("runs", new Date().toISOString().replace(/[:.]/g, "-") + "-" + process.pid);
await mkdir(base, { recursive: true });
const temp = join(base, "browser-temp");
await mkdir(temp);
const browserEnv = { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp };
const server = await serveReference();
let browser;

function countGatePixels(bytes) {
  const frame = PNG.sync.read(bytes);
  let total = 0;
  for (let pixel = 0; pixel < frame.data.length; pixel += 4) {
    const [r, g, b] = frame.data.subarray(pixel, pixel + 3);
    if (r > 210 && g < 75 && b > 95 && b < 175) total++;
  }
  return total;
}

function score(rows, stage) {
  const families = new Map();
  for (const [i, row] of rows.entries()) {
    const entry = plan.cases[i];
    if (entry.stage !== stage) continue;
    if (!families.has(entry.family)) families.set(entry.family, []);
    families.get(entry.family).push(row.status);
  }
  let lower = 0;
  let upper = 0;
  let coverage = 0;
  for (const statuses of families.values()) {
    const n = statuses.length;
    const pass = statuses.filter(status => status === "pass").length;
    const unknown = statuses.filter(status => status === "unverified").length;
    lower += pass / n;
    upper += (pass + unknown) / n;
    coverage += (n - unknown) / n;
  }
  return { interval: [lower / families.size, upper / families.size], coverage: coverage / families.size };
}

async function runVariant(fault) {
  const runId = fault || "reference";
  const root = join(base, runId);
  await mkdir(root);
  const evidence = [];
  const results = [];
  const shared = {};
  const started = performance.now();

  async function save(caseId, filename, bytes, evidenceType, evidenceSource, state) {
    const path = join(root, caseId, filename);
    await mkdir(join(root, caseId), { recursive: true });
    await writeFile(path, bytes);
    const entry = { id: caseId + "/" + filename, evidenceType, evidenceSource,
      storagePath: relative(root, path).replaceAll("\\", "/"), contentDigest: digest(bytes),
      browserMonotonicMs: state?.browserMs ?? null, simulationTick: state?.tick ?? null,
      sequenceIndex: evidence.length };
    evidence.push(entry);
    return entry;
  }

  for (const entry of plan.cases) {
    const caseId = entry.id;
    const dependency = results.find(result => entry.blockedBy.includes(result.caseId) && result.status !== "pass");
    if (dependency) {
      const unknown = dependency.status === "unverified";
      results.push({ caseId, status: unknown ? "unverified" : "product_blocked",
        reason: "Required prerequisite " + dependency.caseId + " did not pass.",
        evidenceRefs: dependency.evidenceRefs, ...(unknown ? {} : { blockedBy: dependency.caseId }) });
      continue;
    }

    const notes = {};
    const trace = [];
    const pageErrors = [];
    const firstEvidence = evidence.length;
    const page = caseId === "terminal_feedback" ? null :
      await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
    page?.on("pageerror", error => pageErrors.push(error.message));
    page?.on("console", message => {
      if (message.type() === "error") pageErrors.push(message.text());
    });

    const sample = async () => {
      const state = await page.evaluate(() => ({ ...window.__gameTest.getSnapshot(), browserMs: performance.now() }));
      trace.push(state);
      return state;
    };
    const events = () => page.evaluate(() => window.__gameTest.getEvents(-1));
    async function until(predicate, timeout, reason, milestone) {
      const deadline = performance.now() + timeout;
      do {
        const state = await sample();
        if (predicate(state)) return state;
        await page.waitForTimeout(32);
      } while (performance.now() < deadline);
      throw new CheckFailure(reason, milestone);
    }
    async function move(key, predicate, timeout) {
      const from = trace.length;
      await sample();
      await page.keyboard.down(key);
      try {
        const deadline = performance.now() + timeout;
        do {
          if (predicate(await sample())) break;
          await page.waitForTimeout(32);
        } while (performance.now() < deadline);
      } finally {
        await page.keyboard.up(key);
      }
      await sample();
      return trace.slice(from);
    }
    async function capture(name, selector) {
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const state = await sample();
      const element = selector ? page.locator(selector) : null;
      const bytes = element ? await element.screenshot({ timeout: 5000 }) : await page.screenshot({ timeout: 5000 });
      const frame = await save(caseId, name + ".png", bytes, "event_aligned_frame", "chromium", state);
      return { id: frame.id, bytes, digest: frame.contentDigest, label: element ? await element.innerText() : null };
    }

    let outcome;
    let result;
    try {
      if (page) {
        await page.addInitScript(() => {
          window.__benchmarkInput = [];
          for (const type of ["keydown", "keyup", "blur"]) {
            addEventListener(type, event => window.__benchmarkInput.push({
              type, code: event.code, trusted: event.isTrusted, browserMs: performance.now(),
            }));
          }
        });
        const url = new URL(server.url);
        if (fault) url.searchParams.set("fault", fault);
        await page.goto(url.href, { timeout: 12000 });
        try {
          await page.waitForFunction(() => typeof window.__gameTest?.getSnapshot === "function", undefined, { timeout: 8000 });
          const before = await sample();
          await until(state => state.tick > before.tick, 3000, "Simulation did not start.");
        } catch (error) {
          if (pageErrors.length) throw new CheckFailure("Page error: " + pageErrors.join("; "));
          throw error;
        }
        if (entry.scenario !== "default") {
          const loaded = await page.evaluate(scenario => window.__gameTest.loadScenario(scenario), entry.scenario);
          requireCheck(loaded?.ok, "Required scenario did not load.");
          const initial = await sample();
          requireCheck(!initial.door.unlocked && !initial.door.passable && !initial.goalCrossed &&
            initial.outcome === "none", "Local setup pre-completed the behavior.");
        }
      }
      result = await cases[caseId]({ page, sample, events, until, move, capture, shared, notes, gatePixels: countGatePixels });
      outcome = result?.unverified
        ? { status: "unverified", reason: result.unverified }
        : { status: "pass", reason: "Registered checks satisfied." };
    } catch (error) {
      outcome = error instanceof CheckFailure
        ? { status: "fail", reason: error.message, ...(error.milestone ? { firstUnmetMilestone: error.milestone } : {}) }
        : { status: "unverified", reason: String(error.message ?? error) };
    } finally {
      let inputs = [];
      let stateEvents = [];
      if (page) {
        inputs = await page.evaluate(() => window.__benchmarkInput ?? []).catch(() => []);
        stateEvents = await events().catch(() => []);
        await page.close();
      }
      const payload = JSON.stringify({ caseId, scenarioId: entry.scenario, trace, inputs, stateEvents, pageErrors, notes }, null, 2);
      await save(caseId, "trace.json", payload, "case_trace", "chromium_and_runtime", trace.at(-1));
    }
    const evidenceRefs = [...(result?.refs ?? []), ...evidence.slice(firstEvidence).map(record => record.id)];
    results.push({ caseId, ...outcome, evidenceRefs });
    console.log(runId, caseId, outcome.status, outcome.reason);
  }

  const required = results.filter((_, i) => plan.cases[i].priority !== "P2");
  const strictTaskSuccess = required.some(row => row.status === "fail" || row.status === "product_blocked")
    ? false : required.every(row => row.status === "pass") ? true : null;
  const functional = score(results, "functional");
  const visual = score(results, "visual");
  const report = {
    schemaVersion: "pilot-0.1", recordKind: "run", taskId: "P01", runId,
    artifactVersion: artifactVersion + (fault ? "/" + fault : ""), evaluatorVersion,
    browserVersion: browser.version(), seed: null, cases: results, evidence,
    summary: { strictTaskSuccess, functionalInterval: functional.interval,
      functionalCoverage: functional.coverage, visualCoverage: visual.coverage,
      journeys: { passed: results.filter(row => plan.requiredJourneyCases.includes(row.caseId) && row.status === "pass").length,
        planned: plan.requiredJourneyCases.length } },
  };
  if (!validate(report)) throw new Error(JSON.stringify(validate.errors));
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(runId, JSON.stringify(report.summary), Math.round(performance.now() - started) + "ms", root);
  return report;
}

try {
  browser = await chromium.launch({ executablePath, headless: true, env: browserEnv,
    args: ["--disable-background-networking", "--disable-sync", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const reports = [];
  for (const fault of variants) reports.push(await runVariant(fault));
  if (variants.includes("")) {
    const reference = reports[0];
    if (reference.cases.some(row => row.status !== "pass")) process.exitCode = 1;
  }
  if (args.includes("--calibrate")) {
    for (const fault of calibration) {
      const outcomes = new Map(reports.find(report => report.runId === fault.id).cases.map(row => [row.caseId, row.status]));
      for (const [expected, status] of [[fault.mustDetect, "fail"], [fault.mustPreserve, "pass"]]) {
        for (const id of expected) {
          if (outcomes.get(id) !== status) {
            console.error(fault.id, id, "expected", status, "observed", outcomes.get(id));
            process.exitCode = 1;
          }
        }
      }
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
