import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { digest, startBrowser } from "./browser-evaluation.mjs";
import { serveReference } from "./server.mjs";

const [directory, output, ...extra] = process.argv.slice(2);
if (!directory || !output || extra.length) {
  throw new Error("Usage: node scripts/replay-gameasg-capys.mjs <single-HTML-directory> <new-output-directory>");
}
const artifact = resolve(directory);
const root = resolve(output);
await mkdir(root);
const artifactSha256 = digest(await readFile(join(artifact, "index.html")));
const checkpoints = [];
const frames = [];
const record = (id, pass, observations) => checkpoints.push({ id, pass, observations });
const started = performance.now();
const server = await serveReference(0, artifact);
try {
  const { browser } = await startBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.clock.install({ time: new Date("2020-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2020-01-01T00:00:10Z"));
    await page.addInitScript(() => {
      window.nativeInputs = [];
      for (const type of ["click", "pointerdown", "pointerup", "keydown", "keyup"]) {
        addEventListener(type, event => window.nativeInputs.push({
          type, trusted: event.isTrusted, code: event.code, x: event.clientX, y: event.clientY,
          atMs: performance.now(),
        }));
      }
    });
    const state = () => page.evaluate(() => window.__gameTest.getSnapshot());
    async function frame(name) {
      const before = await state();
      const file = name + ".png";
      const bytes = await page.screenshot({ path: join(root, file) });
      frames.push({ file, sha256: digest(bytes), phase: before.phase, flightTime: before.flightTime });
    }
    const advance = ms => page.clock.runFor(ms);
    await page.goto(server.url);
    const menu = await state();
    await page.getByRole("button", { name: /let.s take off/i }).click();
    const entry = await state();
    record("native_start", menu.phase === "menu" && entry.phase === "launch" && entry.canInteractWithPlayfield, { menu, entry });

    const x = Math.round(entry.player.screenX);
    const y = Math.round(entry.player.screenY);
    await page.mouse.click(x, y);
    const noPull = await state();
    record("release_without_pull", noPull.phase === "launch" &&
      noPull.player.screenX === entry.player.screenX && noPull.player.screenY === entry.player.screenY, { noPull });

    await page.mouse.move(x, y);
    await page.mouse.down();
    await advance(80);
    const targetY = Math.min(y + 50, Math.floor(entry.playfield.y + entry.playfield.height - 1));
    for (let step = 1; step <= 8; step++) {
      await page.mouse.move(x - 90 * step / 8, y + (targetY - y) * step / 8);
      await advance(25);
    }
    const pulled = await state();
    await frame("pull");
    await page.mouse.up();
    const released = await state();
    const trajectory = [];
    for (let frameIndex = 0; frameIndex < 3; frameIndex++) {
      await advance(17);
      trajectory.push(await state());
    }
    const movesUpRight = trajectory.every((sample, index) => {
      const before = index ? trajectory[index - 1] : pulled;
      return sample.phase === "flight" && sample.player.screenX > before.player.screenX &&
        sample.player.screenY < before.player.screenY;
    });
    record("left_down_pull_launches_right_up", pulled.phase === "launch" && pulled.pull.active &&
      pulled.pull.dx < 0 && pulled.pull.dy > 0 && released.phase === "flight" && movesUpRight,
    { pulled, released, trajectory });
    await frame("launch");

    const beforeFlap = await state();
    await page.keyboard.press("Space");
    await advance(34);
    const afterFlap = await state();
    record("one_flap_consumed_and_lifts", afterFlap.flaps.remaining === beforeFlap.flaps.remaining - 1 &&
      afterFlap.player.screenY < beforeFlap.player.screenY &&
      afterFlap.player.velocityY < beforeFlap.player.velocityY, { beforeFlap, afterFlap });
    await frame("flap");

    const retryButton = page.getByRole("button", { name: /fly again/i });
    let result = await state();
    for (let elapsed = 0; result.phase !== "result" && elapsed < 30000; elapsed += 500) {
      await advance(500);
      result = await state();
    }
    const retryVisible = await retryButton.isVisible();
    record("normal_flight_reaches_results", result.phase === "result" && result.result.visible && retryVisible &&
      result.result.finalDistance > 0 && result.result.finalScore > 0, { result, retryVisible });
    if (retryVisible) {
      await frame("result");
      await retryButton.click();
      await advance(34);
      const retry = await state();
      record("visible_retry_resets_flight", retry.phase === "launch" && retry.score === 0 &&
        retry.distance === 0 && retry.flaps.remaining === retry.flaps.max && !retry.result.visible, { retry });
      await frame("retry");
    } else {
      checkpoints.push({ id: "visible_retry_resets_flight", pass: null, blockedBy: "normal_flight_reaches_results" });
    }
    const inputs = await page.evaluate(() => window.nativeInputs);
    record("trusted_browser_inputs", inputs.length > 0 && inputs.every(input => input.trusted), { inputs });
    const report = {
      taskId: "capys-flight-adventure", artifactSha256, browserVersion: browser.version(),
      browserInput: "Normal entry and native mouse/keyboard only, with read-only snapshots.",
      journeyBudgetSeconds: 30, wallMs: Math.round(performance.now() - started), checkpoints, frames,
    };
    await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(report.checkpoints.map(row => row.id + ": " + row.pass).join("\n"));
    if (checkpoints.some(row => row.pass !== true)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
