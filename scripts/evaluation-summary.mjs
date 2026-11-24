function score(plan, rows, stage) {
  const families = new Map();
  for (const [i, row] of rows.entries()) {
    const entry = plan.cases[i];
    if (entry.stage !== stage) continue;
    if (!families.has(entry.family)) families.set(entry.family, []);
    families.get(entry.family).push(row.status);
  }
  if (!families.size) return { interval: null, coverage: null };
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

function counts(rows) {
  const passed = rows.filter(row => row.status === "pass").length;
  const failed = rows.filter(row => row.status === "fail").length;
  const blocked = rows.filter(row => row.status === "product_blocked").length;
  const unverified = rows.length - passed - failed - blocked;
  return { planned: rows.length, passed, failed, blocked, unverified,
    verifiedPassRate: rows.length > unverified ? passed / (rows.length - unverified) : null };
}

export function summarize(plan, results, profile) {
  const required = results.filter((_, i) => plan.cases[i].priority !== "P2" ||
    plan.requiredJourneyCases.includes(plan.cases[i].id));
  const strictTaskSuccess = profile && profile !== "C" ? null :
    required.some(row => row.status === "fail" || row.status === "product_blocked")
    ? false : required.every(row => row.status === "pass") ? true : null;
  const functional = score(plan, results, "functional");
  const visual = score(plan, results, "visual");
  const by = predicate => counts(results.filter((_, i) => predicate(plan.cases[i])));
  return {
    strictTaskSuccess,
    functionalInterval: functional.interval,
    functionalCoverage: functional.coverage,
    visualCoverage: visual.coverage,
    journeys: {
      passed: results.filter(row => plan.requiredJourneyCases.includes(row.caseId) && row.status === "pass").length,
      planned: plan.requiredJourneyCases.length,
    },
    stages: {
      buildAndLaunch: by(entry => entry.stage === "prerequisite"),
      functionalChecks: by(entry => entry.stage === "functional"),
      functionalByCaseType: Object.fromEntries(["positive", "negative", "boundary", "recovery"].map(type =>
        [type, by(entry => entry.stage === "functional" && entry.caseType === type)])),
      scriptedPlaythrough: by(entry => entry.stage === "journey"),
      visualFeedback: by(entry => entry.stage === "visual"),
      completenessAndRecovery: by(entry => entry.stage === "prerequisite" || entry.caseType === "recovery" &&
        entry.stage !== "visual"),
    },
  };
}

export function reportPlan(report, legacy) {
  const definitions = report.casePlan ?? legacy.cases;
  const byId = new Map(definitions.map(entry => [entry.id, entry]));
  const selected = report.cases.map(row => byId.get(row.caseId));
  if (selected.some(entry => !entry) || new Set(selected).size !== selected.length) {
    throw new Error("Report results do not match the case definitions.");
  }
  if (report.casePlan && selected.length !== definitions.length) {
    throw new Error("The report is missing results for registered cases.");
  }
  const required = report.requiredJourneyCases ?? legacy.requiredJourneyCases;
  return { cases: selected, requiredJourneyCases: required.filter(id => selected.some(entry => entry.id === id)) };
}
