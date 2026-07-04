const assert = require("node:assert/strict");
const test = require("node:test");

const {
  VERSION_DEFINITIONS,
  SHIFT_DEFINITIONS,
  DEFAULT_SHIFT_DEFINITION_LIST,
  CUSTOM_VERSION_ID,
  CUSTOM_VERSION_EXPORT_SCHEMA_VERSION,
  CUSTOM_VERSION_EXPORT_TYPE,
  DEFAULT_VERSION_ID,
  BASE_VERSION_STORAGE_KEY,
  CUSTOM_VERSIONS_STORAGE_KEY,
  DISPLAY_SETTINGS_STORAGE_KEY,
  createSimulation,
  createCustomScheduleSettings,
  createCustomVersion,
  createCustomVersionExportJson,
  createCustomVersionExportPayload,
  createScheduleSettingsForVersion,
  deleteCustomVersion,
  getCalendarWorkSegments,
  getRuleStatusText,
  getScheduleTagPopoverText,
  getVersionActionsViewModel,
  loadBaseVersionDefinitions,
  loadActiveShiftDefinitionsForSchedule,
  loadCustomVersionLibrary,
  loadDisplaySettings,
  loadScheduleSettings,
  importCustomVersionExport,
  normalizeDisplaySettings,
  renameCustomVersion,
  promoteCurrentCustomVersionLibrary,
  saveBaseVersionDefinitions,
  saveDisplaySettings,
  saveCustomVersionLibrary,
  saveScheduleSettings,
  SCHEDULE_SETTINGS_STORAGE_KEY,
  SHIFT_SETTINGS_STORAGE_KEY,
  getWeekendHoursForShift,
  getShiftSettingsViewModel,
  getScheduleDayHeader,
  getScheduleTableSizing,
  loadShiftDefinitions,
  normalizeShiftDefinitions,
  parseCycleInput,
  removeShiftDefinition,
  getAnnualCounterBalance,
  renderAnnualCounterCell,
} = require("./app.js");

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

test("une serie de nuits doit etre suivie d'une descente de nuit", () => {
  expectRuleStatus("N DN R R R R R", "night-dn", "pass");
  expectRuleStatus("N N R R R R R", "night-dn", "fail");
  expectRuleStatus("N N DN R R R R", "night-dn", "pass");
  expectRuleStatus("N N N R R R R", "night-dn", "fail");
  expectRuleStatus("N N N DN R R R", "night-dn", "pass");
});

test("la regle de descente apres nuits ne limite pas son libelle au plafond de trois nuits", () => {
  const simulation = createSimulation("v7", {
    startDate: "2026-01-05",
    weekendDispoLimit: "0",
    seriesOffset: "1",
    cycle: "N N N N DN R R",
  });
  const rule = simulation.rules.find((candidate) => candidate.id === "night-dn");

  assert.equal(rule.status, "pass");
  assert.equal(rule.detail, "Chaque série d'au moins une nuit est suivie d'une descente.");
});

test("une descente de nuit ne peut suivre qu'une serie de nuits", () => {
  const rule = getRule("M DN R R R R R", "night-dn");

  assert.equal(rule.status, "fail");
  assert.equal(rule.title, "Descente après série de nuits");
  assert.match(rule.detail, /DN sans nuit précédente/);
});

test("apres une descente de plusieurs nuits aucune reprise ne commence avant midi", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "X",
      label: "Reprise avant midi",
      color: "#4f46e5",
      startTime: "11:00",
      endTime: "19:00",
      isOff: false,
    },
  ]);
  const simulation = createSimulation("v7", {
    startDate: "2026-01-05",
    weekendDispoLimit: "0",
    seriesOffset: "1",
    cycle: "N N DN X R R R",
    shiftDefinitions,
  });
  const rule = simulation.rules.find((candidate) => candidate.id === "dispo-after-multi-night");

  assert.equal(rule.title, "Pas de reprise avant midi après DN de plusieurs nuits");
  assert.equal(rule.status, "fail");
  assert.match(rule.detail, /S01 08\/01/);
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

test("le cycle valide les codes contre les pauses dynamiques", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "X",
      label: "Renfort",
      color: "#4f46e5",
      startTime: "09:00",
      endTime: "17:00",
      unpaidBreakMinutes: 30,
      isOff: false,
    },
  ]);

  assert.equal(parseCycleInput("X R", shiftDefinitions).valid, true);
  assert.deepEqual(parseCycleInput("X R").invalidTokens, ["X"]);
});

test("un code personnalise peut alimenter la simulation", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "X",
      label: "Renfort",
      color: "#4f46e5",
      startTime: "09:00",
      endTime: "17:00",
      unpaidBreakMinutes: 30,
      isOff: false,
    },
  ]);
  const simulation = createSimulation("v7", {
    startDate: "2026-01-05",
    weekendDispoLimit: "0",
    seriesOffset: "1",
    cycle: "X R R R R R R",
    shiftDefinitions,
  });
  const firstSeries = simulation.stats.find((row) => row.seriesId === "S01");

  assert.equal(firstSeries.totalHours, 397.5);
  assert.ok(Math.abs(firstSeries.averageWeeklyHours - 7.623287671232877) < 0.0000001);
});

test("une journee sans horaire est comptee comme non travaillee", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "OFF",
      label: "Sans horaire",
      color: "#b8b4aa",
      isOff: true,
    },
  ]);
  const simulation = createSimulation("v7", {
    startDate: "2026-01-05",
    weekendDispoLimit: "0",
    seriesOffset: "1",
    cycle: "OFF",
    shiftDefinitions,
  });
  const firstSeries = simulation.stats.find((row) => row.seriesId === "S01");

  assert.equal(firstSeries.totalHours, 0);
  assert.equal(firstSeries.maxConsecutiveWorkDays, 0);
});

test("les minutes de pause non payee sont deduites des heures payees", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    {
      code: "P",
      label: "Pause payee partielle",
      color: "#0f766e",
      startTime: "08:00",
      endTime: "18:00",
      unpaidBreakMinutes: 90,
      isOff: false,
    },
    {
      code: "R",
      label: "Repos",
      color: "#d8d5cc",
      isOff: true,
    },
  ]);
  const simulation = createSimulation("v7", {
    startDate: "2026-01-05",
    weekendDispoLimit: "0",
    seriesOffset: "1",
    cycle: "P R R R R R R",
    shiftDefinitions,
  });
  const firstSeries = simulation.stats.find((row) => row.seriesId === "S01");

  assert.equal(firstSeries.totalHours, 450.5);
});

test("modifier une heure normalisee ne revient pas a l'ancienne valeur derivee", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    {
      code: "P",
      label: "Pause modifiable",
      color: "#0f766e",
      startTime: "08:00",
      endTime: "18:00",
      breakStartTime: "12:00",
      breakEndTime: "12:30",
      isOff: false,
    },
  ]);
  const updatedDefinitions = normalizeShiftDefinitions({
    ...shiftDefinitions,
    P: {
      ...shiftDefinitions.P,
      startTime: "09:00",
    },
  });

  assert.equal(updatedDefinitions.P.startTime, "09:00");
  assert.equal(updatedDefinitions.P.startHour, 9);
  assert.equal(updatedDefinitions.P.hours, 8.5);
});

test("saisir seulement le debut de pause conserve la valeur sans appliquer de pause incomplete", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    {
      code: "P",
      label: "Pause modifiable",
      color: "#0f766e",
      startTime: "08:00",
      endTime: "18:00",
      breakStartTime: "12:00",
      breakEndTime: "12:30",
      isOff: false,
    },
  ]);
  const updatedDefinitions = normalizeShiftDefinitions({
    ...shiftDefinitions,
    P: {
      ...shiftDefinitions.P,
      breakStartTime: "13:00",
      breakEndTime: "",
    },
  });

  assert.equal(updatedDefinitions.P.breakStartTime, "13:00");
  assert.equal(updatedDefinitions.P.breakEndTime, "");
  assert.equal(updatedDefinitions.P.unpaidBreakMinutes, 0);
  assert.equal(updatedDefinitions.P.hours, 10);
});

test("une pause non payee placee en nuit est deduite des heures de nuit", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    {
      code: "P",
      label: "Nuit avec pause",
      color: "#343a66",
      startTime: "21:00",
      endTime: "07:00",
      breakStartTime: "23:00",
      breakEndTime: "23:30",
      isOff: false,
    },
    {
      code: "R",
      label: "Repos",
      color: "#d8d5cc",
      isOff: true,
    },
  ]);
  const simulation = createSimulation("v7", {
    startDate: "2026-01-05",
    weekendDispoLimit: "0",
    seriesOffset: "1",
    cycle: "P R R R R R R",
    shiftDefinitions,
  });
  const firstSeries = simulation.stats.find((row) => row.seriesId === "S01");

  assert.equal(firstSeries.totalHours, 503.5);
  assert.equal(firstSeries.nightHoursYear, 397.5);
});

test("une pause non payee placee le week-end est deduite des heures week-end", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    {
      code: "P",
      label: "Vendredi nuit",
      color: "#343a66",
      startTime: "21:00",
      endTime: "07:00",
      breakStartTime: "00:30",
      breakEndTime: "01:00",
      isOff: false,
    },
    {
      code: "R",
      label: "Repos",
      color: "#d8d5cc",
      isOff: true,
    },
  ]);
  const simulation = createSimulation("v7", {
    startDate: "2026-01-09",
    weekendDispoLimit: "0",
    seriesOffset: "1",
    cycle: "P R R R R R R",
    shiftDefinitions,
  });
  const firstSeries = simulation.stats.find((row) => row.seriesId === "S01");

  assert.equal(firstSeries.weekendWorkedYear, 53);
  assert.equal(firstSeries.weekendHoursYear, 344.5);
});

test("la suppression est bloquee quand le code est encore utilise dans le cycle", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "X",
      label: "Renfort",
      color: "#4f46e5",
      startTime: "09:00",
      endTime: "17:00",
      unpaidBreakMinutes: 0,
      isOff: false,
    },
  ]);
  const blocked = removeShiftDefinition(shiftDefinitions, "X", "M X R");
  const removed = removeShiftDefinition(shiftDefinitions, "X", "M R");

  assert.equal(blocked.removed, false);
  assert.match(blocked.message, /encore utilisee/i);
  assert.ok(blocked.shiftDefinitions.X);
  assert.equal(removed.removed, true);
  assert.equal(removed.shiftDefinitions.X, undefined);
});

test("le chargement localStorage revient aux pauses par defaut si les donnees sont invalides", () => {
  const storage = {
    getItem() {
      return "{invalid";
    },
  };
  const shiftDefinitions = loadShiftDefinitions(storage);

  assert.equal(shiftDefinitions.M.label, "Matin");
  assert.equal(shiftDefinitions.N.startTime, "21:00");
});

test("la version officielle selectionnee est restauree apres rechargement", () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  const settings = createScheduleSettingsForVersion("v8", SHIFT_DEFINITIONS);

  saveScheduleSettings(settings, storage);
  const loaded = loadScheduleSettings(storage, SHIFT_DEFINITIONS);

  assert.equal(values.has(SCHEDULE_SETTINGS_STORAGE_KEY), true);
  assert.equal(loaded.versionId, "v8");
  assert.equal(loaded.baseVersionId, "v8");
  assert.equal(loaded.cycle, "M A N DN R R D D");
});

test("la version equilibree est la version officielle par defaut", () => {
  const library = loadCustomVersionLibrary();
  const settings = loadScheduleSettings(undefined, SHIFT_DEFINITIONS);
  const officialIds = Object.keys(VERSION_DEFINITIONS);

  assert.deepEqual(officialIds, ["v7-balanced", "v7", "v8", DEFAULT_VERSION_ID]);
  assert.equal(library.selectedVersionId, "v7-balanced");
  assert.equal(library.customVersions.length, 0);
  assert.equal(settings.versionId, "v7-balanced");
  assert.equal(settings.baseVersionId, "v7-balanced");
  assert.equal(settings.cycle.split(" ").length, 49);
  assert.equal(VERSION_DEFINITIONS[DEFAULT_VERSION_ID].label, "Horaire actuel");
});

test("modifier un champ horaire hors version cree une version custom persistable", () => {
  const official = createScheduleSettingsForVersion("v8", SHIFT_DEFINITIONS);
  const custom = createCustomScheduleSettings(official, {
    weekendDispoLimit: "2",
    seriesCount: "9",
    seriesOffset: "3",
    cycle: "M A N DN R D R D",
  });

  assert.equal(custom.versionId, CUSTOM_VERSION_ID);
  assert.equal(custom.baseVersionId, "v8");
  assert.equal(custom.startDate, undefined);
  assert.equal(custom.weekendDispoLimit, "2");
  assert.equal(custom.seriesCount, "9");
  assert.equal(custom.seriesOffset, "3");
  assert.equal(custom.cycle, "M A N DN R D R D");

  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  saveScheduleSettings(custom, storage);
  const loaded = loadScheduleSettings(storage, SHIFT_DEFINITIONS);

  assert.deepEqual(loaded, custom);
});

test("un custom horaire actuel est promu en version de base persistable", () => {
  const official = createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS);
  const shiftDefinitions = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "X",
      label: "Renfort actuel",
      color: "#4f46e5",
      startTime: "09:00",
      endTime: "17:30",
      isOff: false,
    },
  ]);
  const custom = createCustomVersion({
    id: "custom-current",
    name: "horaire actuel",
    scheduleSettings: {
      ...official,
      weekendDispoLimit: "2",
      seriesCount: "9",
      seriesOffset: "3",
      cycle: "M X R R R R R R R",
    },
    shiftDefinitions,
  });
  const promoted = promoteCurrentCustomVersionLibrary({
    selectedVersionId: custom.id,
    customVersions: [custom],
  });
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  saveBaseVersionDefinitions({ [DEFAULT_VERSION_ID]: promoted.versionDefinition }, storage);
  const loadedDefinitions = loadBaseVersionDefinitions(storage);
  const storedPayload = JSON.parse(values.get(BASE_VERSION_STORAGE_KEY));

  assert.equal(promoted.library.selectedVersionId, DEFAULT_VERSION_ID);
  assert.equal(promoted.library.customVersions.length, 0);
  assert.equal(promoted.versionDefinition.id, DEFAULT_VERSION_ID);
  assert.equal(promoted.versionDefinition.label, "Horaire actuel");
  assert.equal(promoted.versionDefinition.seriesCount, 9);
  assert.equal(promoted.versionDefinition.weeks, 9);
  assert.equal(promoted.versionDefinition.weekendDispoLimit, "2");
  assert.equal(promoted.versionDefinition.seriesOffset, "3");
  assert.deepEqual(promoted.versionDefinition.cycle, ["M", "X", "R", "R", "R", "R", "R", "R", "R"]);
  assert.equal(promoted.versionDefinition.shiftDefinitions.find((shift) => shift.code === "X").label, "Renfort actuel");
  assert.equal(storedPayload[DEFAULT_VERSION_ID].label, "Horaire actuel");
  assert.equal(loadedDefinitions[DEFAULT_VERSION_ID].shiftDefinitions.find((shift) => shift.code === "X").label, "Renfort actuel");
});

test("la date de depart est un reglage d'affichage separe des versions", () => {
  const official = createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS);
  const custom = createCustomVersion({
    id: "custom-date",
    name: "Sans date version",
    scheduleSettings: { ...official, startDate: "2026-02-02" },
    shiftDefinitions: SHIFT_DEFINITIONS,
  });
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  saveCustomVersionLibrary(
    { selectedVersionId: custom.id, customVersions: [custom] },
    storage,
  );
  saveDisplaySettings({ startDate: "2026-02-02" }, storage);

  const loadedLibrary = loadCustomVersionLibrary(storage);
  const loadedDisplay = loadDisplaySettings(storage);
  const storedCustomPayload = JSON.parse(values.get(CUSTOM_VERSIONS_STORAGE_KEY));

  assert.equal(storedCustomPayload.customVersions[0].scheduleSettings.startDate, undefined);
  assert.equal(loadedLibrary.customVersions[0].scheduleSettings.startDate, undefined);
  assert.equal(values.has(DISPLAY_SETTINGS_STORAGE_KEY), true);
  assert.equal(loadedDisplay.startDate, "2026-02-02");
});

test("la date de depart est toujours ramenee au lundi de la semaine", () => {
  assert.equal(normalizeDisplaySettings({ startDate: "2026-02-02" }).startDate, "2026-02-02");
  assert.equal(normalizeDisplaySettings({ startDate: "2026-02-03" }).startDate, "2026-02-02");
  assert.equal(normalizeDisplaySettings({ startDate: "2026-02-08" }).startDate, "2026-02-02");
});

test("un horaire custom peut choisir un nombre de series qui fixe aussi les semaines", () => {
  const official = createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS);
  const custom = createCustomScheduleSettings(official, {
    seriesCount: "10",
  });
  const simulation = createSimulation(CUSTOM_VERSION_ID, {
    scheduleSettings: custom,
    startDate: "2026-01-05",
    weekendDispoLimit: custom.weekendDispoLimit,
    seriesOffset: custom.seriesOffset,
    cycle: custom.cycle,
  });

  assert.equal(simulation.version.seriesCount, 10);
  assert.equal(simulation.version.weeks, 10);
  assert.equal(simulation.series.length, 10);
  assert.equal(simulation.weeks.length, 10);
});

test("la largeur du tableau suit le nombre de semaines avec des cellules fixes", () => {
  const sevenWeeks = getScheduleTableSizing(7);
  const twelveWeeks = getScheduleTableSizing(12);

  assert.equal(sevenWeeks.dayColumnWidth, twelveWeeks.dayColumnWidth);
  assert.equal(sevenWeeks.seriesColumnWidth, twelveWeeks.seriesColumnWidth);
  assert.equal(sevenWeeks.dayCount, 49);
  assert.equal(twelveWeeks.dayCount, 84);
  assert.equal(sevenWeeks.tableWidth, 92 + 49 * 64);
  assert.equal(twelveWeeks.tableWidth, 92 + 84 * 64);
});

test("les en-tetes du tableau horaire affichent les dates au lieu des numeros de semaine", () => {
  const header = getScheduleDayHeader(new Date(2026, 0, 5));

  assert.deepEqual(header, {
    dateLabel: "05/01",
    dayLabel: "Lun",
  });
});

test("plusieurs versions custom conservent leurs horaires et pauses separement", () => {
  const official = createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS);
  const shiftsWithRenfort = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "X",
      label: "Renfort",
      color: "#4f46e5",
      startTime: "09:00",
      endTime: "17:00",
      isOff: false,
    },
  ]);
  const first = createCustomVersion({
    id: "custom-a",
    name: "Equipe A",
    scheduleSettings: { ...official, seriesCount: "9", cycle: "M X R R R R R" },
    shiftDefinitions: shiftsWithRenfort,
  });
  const second = createCustomVersion({
    id: "custom-b",
    name: "Equipe B",
    scheduleSettings: { ...official, seriesCount: "6", cycle: "M A N DN R R D" },
    shiftDefinitions: SHIFT_DEFINITIONS,
  });
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  saveCustomVersionLibrary(
    {
      selectedVersionId: "custom-b",
      customVersions: [first, second],
    },
    storage,
  );
  const loaded = loadCustomVersionLibrary(storage);

  assert.equal(values.has(CUSTOM_VERSIONS_STORAGE_KEY), true);
  assert.equal(loaded.selectedVersionId, "custom-b");
  assert.equal(loaded.customVersions.length, 2);
  assert.equal(loaded.customVersions[0].name, "Equipe A");
  assert.equal(loaded.customVersions[0].scheduleSettings.seriesCount, "9");
  assert.equal(loaded.customVersions[0].shiftDefinitions.X.label, "Renfort");
  assert.equal(loaded.customVersions[1].name, "Equipe B");
  assert.equal(loaded.customVersions[1].shiftDefinitions.X, undefined);
});

test("une version custom active peut etre exportee en JSON sans date de depart", () => {
  const shiftDefinitions = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "X",
      label: "Renfort exporte",
      color: "#4f46e5",
      startTime: "09:00",
      endTime: "17:00",
      isOff: false,
    },
  ]);
  const custom = createCustomVersion({
    id: "custom-export-source",
    name: "Equipe export",
    scheduleSettings: {
      ...createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS),
      seriesCount: "9",
      cycle: "M X R R R R R",
      startDate: "2026-02-03",
    },
    shiftDefinitions,
  });
  const payload = createCustomVersionExportPayload(custom, "2026-07-04T08:00:00.000Z");
  const json = createCustomVersionExportJson(custom, "2026-07-04T08:00:00.000Z");

  assert.equal(payload.type, CUSTOM_VERSION_EXPORT_TYPE);
  assert.equal(payload.schemaVersion, CUSTOM_VERSION_EXPORT_SCHEMA_VERSION);
  assert.equal(payload.exportedAt, "2026-07-04T08:00:00.000Z");
  assert.equal(payload.version.id, undefined);
  assert.equal(payload.version.name, "Equipe export");
  assert.equal(payload.version.baseVersionId, "v7");
  assert.equal(payload.version.scheduleSettings.versionId, undefined);
  assert.equal(payload.version.scheduleSettings.customName, undefined);
  assert.equal(payload.version.scheduleSettings.startDate, undefined);
  assert.equal(payload.version.scheduleSettings.seriesCount, "9");
  assert.equal(payload.version.scheduleSettings.cycle, "M X R R R R R");
  assert.equal(payload.version.shiftDefinitions.find((shift) => shift.code === "X").label, "Renfort exporte");
  assert.deepEqual(JSON.parse(json), payload);
});

test("importer un JSON custom ajoute une nouvelle version sans ecraser l'existant", () => {
  const existing = createCustomVersion({
    id: "custom-existing",
    name: "Version existante",
    scheduleSettings: createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS),
    shiftDefinitions: SHIFT_DEFINITIONS,
  });
  const importedShiftDefinitions = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "X",
      label: "Renfort importe",
      color: "#4f46e5",
      startTime: "09:00",
      endTime: "17:00",
      isOff: false,
    },
  ]);
  const importedSource = createCustomVersion({
    id: "custom-file-id",
    name: "Version importee",
    scheduleSettings: {
      ...createScheduleSettingsForVersion("v8", SHIFT_DEFINITIONS),
      seriesCount: "10",
      cycle: "M X R R R R R R",
    },
    shiftDefinitions: importedShiftDefinitions,
  });
  const imported = importCustomVersionExport(
    { selectedVersionId: existing.id, customVersions: [existing] },
    createCustomVersionExportPayload(importedSource, "2026-07-04T08:00:00.000Z"),
  );

  assert.equal(imported.library.customVersions.length, 2);
  assert.equal(imported.library.customVersions[0].id, existing.id);
  assert.equal(imported.library.customVersions[0].name, "Version existante");
  assert.notEqual(imported.version.id, "custom-file-id");
  assert.equal(imported.library.selectedVersionId, imported.version.id);
  assert.equal(imported.version.name, "Version importee");
  assert.equal(imported.version.baseVersionId, "v8");
  assert.equal(imported.version.scheduleSettings.seriesCount, "10");
  assert.equal(imported.version.scheduleSettings.cycle, "M X R R R R R R");
  assert.equal(imported.version.shiftDefinitions.X.label, "Renfort importe");
});

test("importer un nom deja present ajoute le suffixe import", () => {
  const existing = createCustomVersion({
    id: "custom-existing",
    name: "Equipe A",
    scheduleSettings: createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS),
    shiftDefinitions: SHIFT_DEFINITIONS,
  });
  const source = createCustomVersion({
    id: "custom-source",
    name: "Equipe A",
    scheduleSettings: createScheduleSettingsForVersion("v8", SHIFT_DEFINITIONS),
    shiftDefinitions: SHIFT_DEFINITIONS,
  });
  const imported = importCustomVersionExport(
    { selectedVersionId: existing.id, customVersions: [existing] },
    createCustomVersionExportPayload(source, "2026-07-04T08:00:00.000Z"),
  );

  assert.equal(imported.version.name, "Equipe A (import)");
  assert.equal(imported.library.customVersions.map((version) => version.name).join(" | "), "Equipe A | Equipe A (import)");
});

test("un import JSON invalide ou de mauvais format est rejete sans changement", () => {
  const existing = createCustomVersion({
    id: "custom-existing",
    name: "Version existante",
    scheduleSettings: createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS),
    shiftDefinitions: SHIFT_DEFINITIONS,
  });
  const library = { selectedVersionId: existing.id, customVersions: [existing] };

  assert.throws(() => importCustomVersionExport(library, "{invalid"), /JSON invalide/);
  assert.throws(
    () =>
      importCustomVersionExport(library, {
        type: "horaire10h.other",
        schemaVersion: CUSTOM_VERSION_EXPORT_SCHEMA_VERSION,
        version: {},
      }),
    /format non reconnu/i,
  );
  assert.throws(
    () =>
      importCustomVersionExport(library, {
        type: CUSTOM_VERSION_EXPORT_TYPE,
        schemaVersion: 99,
        version: {},
      }),
    /format non reconnu/i,
  );

  assert.equal(library.customVersions.length, 1);
  assert.equal(library.selectedVersionId, existing.id);
});

test("renommer et supprimer une version custom garde les versions officielles intactes", () => {
  const custom = createCustomVersion({
    id: "custom-a",
    name: "Ancien nom",
    scheduleSettings: createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS),
    shiftDefinitions: SHIFT_DEFINITIONS,
  });
  const renamed = renameCustomVersion(
    { selectedVersionId: custom.id, customVersions: [custom] },
    custom.id,
    "Cycle brigade",
  );
  const deleted = deleteCustomVersion(renamed, custom.id);

  assert.equal(renamed.customVersions[0].name, "Cycle brigade");
  assert.equal(deleted.customVersions.length, 0);
  assert.equal(deleted.selectedVersionId, "v7");
});

test("l'editeur de nom de version ne s'ouvre que pour une version custom", () => {
  assert.deepEqual(getVersionActionsViewModel(false, true), {
    canRename: false,
    canDelete: false,
    renameEditorOpen: false,
  });
  assert.deepEqual(getVersionActionsViewModel(true, true), {
    canRename: true,
    canDelete: true,
    renameEditorOpen: true,
  });
});

test("l'ancien custom unique est migre en premiere version custom nommee", () => {
  const oldCustom = createCustomScheduleSettings(createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS), {
    seriesCount: "9",
  });
  const customShiftDefinitions = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "X",
      label: "Renfort migre",
      color: "#4f46e5",
      startTime: "09:00",
      endTime: "17:00",
      isOff: false,
    },
  ]);
  const values = new Map([
    [SCHEDULE_SETTINGS_STORAGE_KEY, JSON.stringify(oldCustom)],
    [SHIFT_SETTINGS_STORAGE_KEY, JSON.stringify(Object.values(customShiftDefinitions))],
  ]);
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
  };
  const loaded = loadCustomVersionLibrary(storage);

  assert.equal(loaded.customVersions.length, 1);
  assert.equal(loaded.selectedVersionId, loaded.customVersions[0].id);
  assert.equal(loaded.customVersions[0].name, "Custom");
  assert.equal(loaded.customVersions[0].scheduleSettings.seriesCount, "9");
  assert.equal(loaded.customVersions[0].shiftDefinitions.X.label, "Renfort migre");
});

test("modifier une pause cree aussi une version custom pour garder les versions officielles immuables", () => {
  const official = createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS);
  const custom = createCustomScheduleSettings(official);

  assert.equal(custom.versionId, CUSTOM_VERSION_ID);
  assert.equal(custom.baseVersionId, "v7");
  assert.equal(custom.cycle, official.cycle);
});

test("les versions officielles gardent les pauses par defaut meme si des pauses custom sont stockees", () => {
  const customShiftDefinitions = normalizeShiftDefinitions([
    ...DEFAULT_SHIFT_DEFINITION_LIST,
    {
      code: "X",
      label: "Renfort custom",
      color: "#4f46e5",
      startTime: "09:00",
      endTime: "17:00",
      isOff: false,
    },
  ]);
  const values = new Map([
    [
      "horaire10h.shiftDefinitions.v1",
      JSON.stringify(Object.values(customShiftDefinitions)),
    ],
  ]);
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
  };
  const officialShifts = loadActiveShiftDefinitionsForSchedule(
    createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS),
    storage,
  );
  const customShifts = loadActiveShiftDefinitionsForSchedule(
    createCustomScheduleSettings(createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS)),
    storage,
  );

  assert.equal(officialShifts.X, undefined);
  assert.equal(officialShifts.M.label, "Matin");
  assert.equal(customShifts.X.label, "Renfort custom");
});

test("la legende est en apercu ferme par defaut avant le mode edition", () => {
  const shiftDefinitions = normalizeShiftDefinitions(DEFAULT_SHIFT_DEFINITION_LIST);
  const preview = getShiftSettingsViewModel(shiftDefinitions, false);
  const editor = getShiftSettingsViewModel(shiftDefinitions, true);

  assert.equal(preview.mode, "preview");
  assert.deepEqual(preview.headerActions.map((action) => action.label), ["Modifier"]);
  assert.equal(preview.cards.length, 6);
  assert.equal(preview.cards.every((card) => card.showForm === false), true);
  assert.equal(preview.cards.every((card) => card.showDelete === false), true);

  assert.equal(editor.mode, "edit");
  assert.deepEqual(editor.headerActions.map((action) => action.label), [
    "Ajouter",
    "Fermer",
  ]);
  assert.equal(editor.cards.every((card) => card.showForm === true), true);
  assert.equal(editor.cards.every((card) => card.showDelete === true), true);
});

test("la version 7 series equilibree respecte les regles sans echec", () => {
  const simulation = createSimulation("v7-balanced", {
    startDate: "2026-01-05",
  });
  const failures = simulation.rules.filter((rule) => rule.status === "fail");
  const warningIds = simulation.rules.filter((rule) => rule.status === "warn").map((rule) => rule.id);

  assert.deepEqual(failures, []);
  assert.deepEqual(warningIds, ["weekend-free", "night-hours-cap"]);
  assert.equal(simulation.version.seriesCount, 7);
  assert.equal(simulation.version.weeks, 7);
  assert.equal(simulation.seriesOffset, 7);
});

test("la version 7 series equilibree utilise deux Dispo courtes officielles", () => {
  const settings = createScheduleSettingsForVersion("v7-balanced", SHIFT_DEFINITIONS);
  const shifts = loadActiveShiftDefinitionsForSchedule(settings);
  const simulation = createSimulation("v7-balanced", {
    startDate: "2026-01-05",
  });
  const weekdayDispoRule = simulation.rules.find((rule) => rule.id === "weekday-dispo");

  assert.equal(settings.cycle.split(" ").length, 49);
  assert.equal(settings.seriesOffset, "7");
  assert.equal(shifts.D, undefined);
  assert.equal(shifts.D1.role, "D");
  assert.equal(shifts.D1.startTime, "08:00");
  assert.equal(shifts.D1.endTime, "14:30");
  assert.equal(shifts.D1.breakStartTime, "11:00");
  assert.equal(shifts.D1.breakEndTime, "11:30");
  assert.equal(shifts.D1.unpaidBreakMinutes, 30);
  assert.equal(shifts.D1.hours, 6);
  assert.equal(shifts.D2.role, "D");
  assert.equal(shifts.D2.startTime, "12:00");
  assert.equal(shifts.D2.endTime, "18:30");
  assert.equal(shifts.D2.breakStartTime, "15:00");
  assert.equal(shifts.D2.breakEndTime, "15:30");
  assert.equal(shifts.D2.unpaidBreakMinutes, 30);
  assert.equal(shifts.D2.hours, 6);
  assert.equal(weekdayDispoRule.status, "pass");
  assert.equal(weekdayDispoRule.title, "Au moins 1 Dispo par jour ouvrable");
});

test("les versions existantes gardent leur cible de deux Dispo classiques", () => {
  const current = createSimulation("v7", {
    startDate: "2026-01-05",
    weekendDispoLimit: "0",
    seriesOffset: "1",
    cycle: "M A N DN R R D",
  });
  const currentRule = current.rules.find((rule) => rule.id === "weekday-dispo");
  const currentShifts = loadActiveShiftDefinitionsForSchedule(createScheduleSettingsForVersion("v7", SHIFT_DEFINITIONS));

  assert.equal(currentRule.status, "fail");
  assert.equal(currentRule.title, "Au moins 2 Dispo par jour ouvrable");
  assert.match(currentRule.detail, /253 jour\(s\) ouvrable\(s\) sous le seuil/);
  assert.equal(currentShifts.D.startTime, "08:00");
  assert.equal(currentShifts.D.endTime, "16:06");
});

test("les compteurs annuels de la version equilibree restent proches entre series", () => {
  const simulation = createSimulation("v7-balanced", {
    startDate: "2026-01-05",
  });
  const spread = (values) => Math.max(...values) - Math.min(...values);

  assert.equal(spread(simulation.stats.map((row) => row.weekendWorkedYear)), 1);
  assert.equal(spread(simulation.stats.map((row) => row.weekendHoursYear)), 24);
  assert.equal(spread(simulation.stats.map((row) => row.nightCount)), 2);
  assert.equal(spread(simulation.stats.map((row) => row.nightHoursYear)), 16);
  assert.equal(spread(simulation.stats.map((row) => row.totalHours)), 34);
  assert.equal(Math.max(...simulation.stats.map((row) => row.averageWeeklyHours)) < 38, true);
  assert.equal(Math.max(...simulation.stats.map((row) => row.weekendWorkedYear)) <= 34, true);
});

test("les compteurs annuels signalent les valeurs hors marge de cinq pourcents", () => {
  const balance = getAnnualCounterBalance([
    {
      seriesId: "S01",
      nightHoursYear: 100,
      weekendWorkedYear: 20,
      weekendHoursYear: 240,
      weekendHoursMonth: 20,
    },
    {
      seriesId: "S02",
      nightHoursYear: 106,
      weekendWorkedYear: 21,
      weekendHoursYear: 252,
      weekendHoursMonth: 21,
    },
    {
      seriesId: "S03",
      nightHoursYear: 110,
      weekendWorkedYear: 20,
      weekendHoursYear: 252,
      weekendHoursMonth: 21,
    },
  ]);

  assert.equal(balance.S01.nightHoursYear.imbalanced, true);
  assert.equal(balance.S02.nightHoursYear.imbalanced, false);
  assert.equal(balance.S03.nightHoursYear.imbalanced, false);
  assert.equal(balance.S01.weekendWorkedYear.imbalanced, false);
  assert.equal(balance.S01.weekendHoursYear.imbalanced, false);
  assert.equal(balance.S01.weekendHoursMonth.imbalanced, false);
  assert.ok(Math.abs(balance.S01.nightHoursYear.lower - 100.06666666666666) < 0.0000001);
  assert.ok(Math.abs(balance.S01.nightHoursYear.upper - 110.6) < 0.0000001);
});

test("une valeur annuelle desequilibree affiche un popover explicatif au survol", () => {
  const balance = getAnnualCounterBalance([
    {
      seriesId: "S01",
      nightHoursYear: 100,
      weekendWorkedYear: 20,
      weekendHoursYear: 240,
      weekendHoursMonth: 20,
    },
    {
      seriesId: "S02",
      nightHoursYear: 106,
      weekendWorkedYear: 21,
      weekendHoursYear: 252,
      weekendHoursMonth: 21,
    },
    {
      seriesId: "S03",
      nightHoursYear: 110,
      weekendWorkedYear: 20,
      weekendHoursYear: 252,
      weekendHoursMonth: 21,
    },
  ]);
  const cell = renderAnnualCounterCell(balance.S01, "nightHoursYear", 100);

  assert.doesNotMatch(cell, /stats-popover-trigger/);
  assert.match(cell, /data-floating-popover="true"/);
  assert.match(cell, /data-popover=/);
  assert.match(cell, /Pourquoi cette valeur est rouge/);
  assert.match(cell, /Heures de nuit \/ an/);
  assert.match(cell, /Moyenne des séries/);
  assert.match(cell, /Marge acceptée/);
  assert.match(cell, /sous la marge/);
});

test("les tags de visualisation exposent le texte du popover flottant", () => {
  assert.equal(
    getScheduleTagPopoverText("Nuit précédente", "7 h travaillées"),
    "Nuit précédente · 7 h travaillées",
  );
});

function analyzeCycleSequence(cycleInput) {
  const cycle = cycleInput.split(" ").filter(Boolean);
  const manStarts = [];
  const nightPairs = [];
  const alternatingNightRestStarts = [];
  for (let index = 0; index < cycle.length; index += 1) {
    const current = cycle[index];
    const next = cycle[(index + 1) % cycle.length];
    const afterNext = cycle[(index + 2) % cycle.length];
    const afterAfterNext = cycle[(index + 3) % cycle.length];
    if (current === "M" && next === "A" && afterNext === "N") {
      manStarts.push(index);
    }
    if (current === "N" && next === "N") {
      nightPairs.push({
        startIndex: index,
        startWeekday: index % 7,
        nextWeekday: (index + 1) % 7,
      });
    }
    if (current === "N" && next === "DN" && afterNext === "N" && afterAfterNext === "DN") {
      alternatingNightRestStarts.push(index);
    }
  }
  return { alternatingNightRestStarts, manStarts, nightPairs };
}

function getDisplayWorkedWeekends(simulation) {
  const workedWeekends = [];
  simulation.series.forEach((serie) => {
    for (let saturdayIndex = 5; saturdayIndex < simulation.displayAssignments.days.length; saturdayIndex += 7) {
      const weekendHours = [saturdayIndex, saturdayIndex + 1]
        .flatMap((dayIndex) =>
          getCalendarWorkSegments(simulation.displayAssignments, serie.index, dayIndex),
        )
        .reduce((sum, segment) => sum + segment.hours, 0);
      const codes = [saturdayIndex, saturdayIndex + 1].map(
        (dayIndex) => simulation.displayAssignments.days[dayIndex].assignments[serie.index].code,
      );
      if (weekendHours > 0) {
        workedWeekends.push({
          seriesId: serie.id,
          week: (saturdayIndex - 5) / 7 + 1,
          hours: Math.round(weekendHours * 10) / 10,
          codes: codes.join("/"),
        });
      }
    }
  });
  return workedWeekends;
}

test("la version 7 series equilibree supprime les nuits alternees fatigantes", () => {
  const settings = createScheduleSettingsForVersion("v7-balanced", SHIFT_DEFINITIONS);
  const simulation = createSimulation("v7-balanced", {
    startDate: "2026-01-05",
  });
  const failures = simulation.rules.filter((rule) => rule.status === "fail");
  const warningIds = simulation.rules.filter((rule) => rule.status === "warn").map((rule) => rule.id);
  const weekdayDispoRule = simulation.rules.find((rule) => rule.id === "weekday-dispo");
  const morningCoverageRule = simulation.rules.find((rule) => rule.id === "daily-morning-coverage");
  const sequence = analyzeCycleSequence(settings.cycle);

  assert.equal(simulation.version.label, "10h - 7 Séries Équilibré");
  assert.equal(settings.cycle.split(" ").length, 49);
  assert.equal(settings.seriesOffset, "7");
  assert.deepEqual(failures, []);
  assert.deepEqual(warningIds, ["weekend-free", "night-hours-cap"]);
  assert.equal(weekdayDispoRule?.title, "Au moins 1 Dispo par jour ouvrable");
  assert.equal(morningCoverageRule?.title, "Un Matin par jour, week-end doublable");
  assert.deepEqual(sequence.alternatingNightRestStarts, []);
  assert.deepEqual(sequence.nightPairs, [
    {
      startIndex: 11,
      startWeekday: 4,
      nextWeekday: 5,
    },
  ]);
  assert.equal(Math.max(...simulation.stats.map((row) => row.maxConsecutiveNights)) <= 2, true);
});

test("la version 7 series equilibree concentre les week-ends travailles", () => {
  const simulation = createSimulation("v7-balanced", {
    startDate: "2026-01-05",
  });
  const workedWeekends = getDisplayWorkedWeekends(simulation);
  const weakWeekends = workedWeekends.filter((weekend) => weekend.hours < 16);
  const weakCodes = [...new Set(weakWeekends.map((weekend) => weekend.codes))];
  const spread = (values) => Math.max(...values) - Math.min(...values);

  assert.equal(weakWeekends.length, 7);
  assert.deepEqual(weakCodes, ["M/N"]);
  assert.equal(workedWeekends.filter((weekend) => weekend.codes === "R/M").length, 0);
  assert.equal(workedWeekends.filter((weekend) => weekend.codes === "A/N").length, 0);
  assert.equal(workedWeekends.filter((weekend) => weekend.codes === "N/DN").length, 7);
  assert.equal(workedWeekends.filter((weekend) => weekend.codes === "M/M").length, 7);
  assert.equal(workedWeekends.filter((weekend) => weekend.codes === "A/A").length, 7);
  assert.equal(Math.max(...simulation.stats.map((row) => row.averageWeeklyHours)) < 38, true);
  assert.equal(Math.max(...simulation.stats.map((row) => row.max168Hours)) <= 50, true);
  assert.equal(Math.max(...simulation.stats.map((row) => row.weekendWorkedYear)) <= 34, true);
  assert.equal(Math.max(...simulation.stats.map((row) => row.nightHoursYear)) <= 480, true);
  assert.equal(spread(simulation.stats.map((row) => row.weekendWorkedYear)) <= 1, true);
  assert.equal(spread(simulation.stats.map((row) => row.nightCount)) <= 3, true);
});

test("la version 7 series equilibree publie uniquement le cycle V3 sous le nom equilibre", () => {
  const officialIds = Object.keys(VERSION_DEFINITIONS);
  const settings = createScheduleSettingsForVersion("v7-balanced", SHIFT_DEFINITIONS);
  const simulation = createSimulation("v7-balanced", {
    startDate: "2026-01-05",
  });
  const weekdayDispoRule = simulation.rules.find((rule) => rule.id === "weekday-dispo");
  const morningCoverageRule = simulation.rules.find((rule) => rule.id === "daily-morning-coverage");
  const workedWeekends = getDisplayWorkedWeekends(simulation);

  assert.equal(officialIds.includes("v7-balanced"), true);
  assert.equal(officialIds.includes("v7-balanced-v2"), false);
  assert.equal(officialIds.includes("v7-balanced-v3"), false);
  assert.equal(simulation.version.label, "10h - 7 Séries Équilibré");
  assert.equal(settings.cycle.split(" ").length, 49);
  assert.equal(weekdayDispoRule?.title, "Au moins 1 Dispo par jour ouvrable");
  assert.equal(morningCoverageRule?.title, "Un Matin par jour, week-end doublable");
  assert.equal(workedWeekends.filter((weekend) => weekend.codes === "M/M").length, 7);
  assert.equal(workedWeekends.filter((weekend) => weekend.codes === "A/A").length, 7);
});

test("les anciennes selections equilibrees migrent vers la version equilibree unique", () => {
  const storage = {
    getItem(key) {
      if (key === CUSTOM_VERSIONS_STORAGE_KEY) {
        return JSON.stringify({
          selectedVersionId: "v7-balanced-v3",
          customVersions: [],
        });
      }
      if (key === SCHEDULE_SETTINGS_STORAGE_KEY) {
        return JSON.stringify({
          versionId: "v7-balanced-v2",
          baseVersionId: "v7-balanced-v2",
        });
      }
      return null;
    },
  };

  assert.equal(loadCustomVersionLibrary(storage).selectedVersionId, "v7-balanced");
  assert.equal(loadScheduleSettings(storage, SHIFT_DEFINITIONS).versionId, "v7-balanced");
});
