const assert = require("node:assert/strict");
const test = require("node:test");

const { SHIFT_DEFINITIONS, createSimulation, getRuleStatusText, getWeekendHoursForShift } = require("./app.js");

function getRule(cycle, ruleId) {
  const simulation = createSimulation("v7", {
    startDate: "2026-01-05",
    weekendDispoLimit: "0",
    seriesOffset: "1",
    cycle,
  });
  return simulation.rules.find((rule) => rule.id === ruleId);
}

function getDefaultRulesById() {
  const simulation = createSimulation("v7", {
    startDate: "2026-01-05",
    weekendDispoLimit: "0",
    seriesOffset: "1",
    cycle: "M A N DN R R D",
  });
  return Object.fromEntries(simulation.rules.map((rule) => [rule.id, rule]));
}

function expectRuleStatus(cycle, ruleId, status) {
  const rule = getRule(cycle, ruleId);
  assert.ok(rule, `Expected rule ${ruleId} to exist`);
  assert.equal(rule.status, status, rule.detail);
}

test("10 jours travailles suivis de 2 repos respectent la regle de repos", () => {
  expectRuleStatus("M M M M M M M M M M R R", "consecutive-work", "pass");
});

test("10 jours travailles suivis d'un seul repos avant reprise echouent", () => {
  expectRuleStatus("M M M M M M M M M M R M R", "consecutive-work", "fail");
  expectRuleStatus("M M M M M M M M M M R M R", "single-rest-work-limit", "fail");
});

test("9 jours travailles peuvent etre coupes par un seul repos avant reprise", () => {
  expectRuleStatus("M M M M M M M M M R M R", "single-rest-work-limit", "pass");
});

test("plus de 400 heures de nuit reste orange dans la limite derogatoire", () => {
  expectRuleStatus("N R R R R R R", "night-hours-cap", "warn");
  expectRuleStatus("N R R R R R R", "night-count-cap", "pass");
});

test("les heures de nuit suivent les horaires reels de la pause", () => {
  const originalNightShift = { ...SHIFT_DEFINITIONS.N };
  Object.assign(SHIFT_DEFINITIONS.N, {
    startHour: 20,
    endHour: 29,
    hours: 9,
  });

  try {
    const simulation = createSimulation("v7", {
      startDate: "2026-01-05",
      weekendDispoLimit: "0",
      seriesOffset: "1",
      cycle: "N R R R R R R",
    });
    const firstSeries = simulation.stats.find((row) => row.seriesId === "S01");

    assert.equal(firstSeries.nightCount, 53);
    assert.equal(firstSeries.nightHoursYear, 371);
  } finally {
    Object.assign(SHIFT_DEFINITIONS.N, originalNightShift);
  }
});

test("plus de 480 heures de nuit echoue meme sous 70 nuits annuelles", () => {
  expectRuleStatus("N R R R R R", "night-hours-cap", "fail");
  expectRuleStatus("N R R R R R", "night-count-cap", "pass");
});

test("plus de 70 nuits annuelles reste orange dans la limite derogatoire", () => {
  expectRuleStatus("N R R R R", "night-count-cap", "warn");
});

test("plus de 85 nuits annuelles echoue dans une regle distincte", () => {
  expectRuleStatus("N R R R", "night-count-cap", "fail");
});

test("plus de 28 week-ends travailles reste orange dans la limite derogatoire", () => {
  expectRuleStatus("M M R R R", "weekend-free", "warn");
});

test("un week-end travaille des qu'une prestation touche le week-end", () => {
  const originalNightShift = { ...SHIFT_DEFINITIONS.N };
  Object.assign(SHIFT_DEFINITIONS.N, {
    startHour: 23.5,
    endHour: 24.5,
    hours: 1,
  });

  try {
    const simulation = createSimulation("v7", {
      startDate: "2026-01-05",
      weekendDispoLimit: "0",
      seriesOffset: "1",
      cycle: "R R R R N R R",
    });
    const fridayNightSeries = simulation.stats.find((row) => row.seriesId === "S01");
    const saturdayNightSeries = simulation.stats.find((row) => row.seriesId === "S07");
    const friday = new Date(2026, 0, 9, 23, 30);
    const saturday = new Date(2026, 0, 10, 0, 30);
    const saturdayLate = new Date(2026, 0, 10, 23, 30);
    const sunday = new Date(2026, 0, 11, 0, 30);

    assert.equal(getWeekendHoursForShift(friday, saturday), 0.5);
    assert.equal(getWeekendHoursForShift(saturdayLate, sunday), 1);
    assert.equal(fridayNightSeries.weekendWorkedYear, 52);
    assert.equal(saturdayNightSeries.weekendWorkedYear, 52);
  } finally {
    Object.assign(SHIFT_DEFINITIONS.N, originalNightShift);
  }
});

test("plus de 34 week-ends travailles echoue", () => {
  expectRuleStatus("M R R", "weekend-free", "fail");
});

test("plus de 3 nuits consecutives reste interdit par la regle interne", () => {
  expectRuleStatus("N N N N R R R", "consecutive-nights", "fail");
});

test("le statut orange s'affiche comme OK avec derogation", () => {
  assert.equal(getRuleStatusText("warn"), "OK avec dérogation");
});

test("les controles PJPol sont categorises separement des regles internes", () => {
  const rules = getDefaultRulesById();
  const pjpolRules = [
    "average-weekly",
    "daily-limit",
    "weekly-limit",
    "daily-rest",
    "consecutive-work",
    "single-rest-work-limit",
    "weekend-free",
    "night-hours-cap",
    "night-count-cap",
  ];
  const internalRules = [
    "consecutive-nights",
    "night-dn",
    "morning-after-dn",
    "dispo-after-multi-night",
    "daily-morning-coverage",
    "daily-afternoon-coverage",
    "daily-night-coverage",
    "dispo-non-working",
    "weekday-dispo",
  ];

  pjpolRules.forEach((ruleId) => {
    assert.equal(rules[ruleId]?.category, "pjpol", `${ruleId} should be a PJPol rule`);
  });
  internalRules.forEach((ruleId) => {
    assert.equal(rules[ruleId]?.category, "internal", `${ruleId} should be an internal rule`);
  });
  assert.equal(Object.keys(rules).length, pjpolRules.length + internalRules.length);
});
