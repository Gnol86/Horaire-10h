(function initApp(globalScope) {
  "use strict";

  const HOUR = 60 * 60 * 1000;
  const STANDARD_MAX_WORKED_WEEKENDS = 28;
  const EXTENDED_MAX_WORKED_WEEKENDS = 34;
  const STANDARD_MAX_NIGHT_HOURS = 400;
  const EXTENDED_MAX_NIGHT_HOURS = 480;
  const STANDARD_MAX_NIGHT_COUNT = 70;
  const EXTENDED_MAX_NIGHT_COUNT = 85;
  const MAX_CONSECUTIVE_WORK_DAYS = 10;
  const MAX_WORK_DAYS_BEFORE_SINGLE_REST = 9;
  const MIN_SERIES_COUNT = 1;
  const MAX_SERIES_COUNT = 12;
  const SCHEDULE_SERIES_COLUMN_WIDTH = 92;
  const SCHEDULE_DAY_COLUMN_WIDTH = 64;
  const DEFAULT_VERSION_ID = "current";
  const CURRENT_VERSION_LABEL = "Horaire actuel";
  const RULE_CATEGORIES = {
    pjpol: {
      id: "pjpol",
      title: "Règles PJPol",
      detail: "Statut officiel et seuils avec dérogation éventuelle.",
    },
    internal: {
      id: "internal",
      title: "Règles internes",
      detail: "Contraintes d'organisation propres au cycle du service.",
    },
  };

  const VERSION_DEFINITIONS = {
    [DEFAULT_VERSION_ID]: {
      id: DEFAULT_VERSION_ID,
      label: CURRENT_VERSION_LABEL,
      weeks: 7,
      seriesCount: 7,
      cycle: ["M", "A", "N", "DN", "R", "R", "D"],
    },
    v7: {
      id: "v7",
      label: "10h - 7 Séries Nul",
      weeks: 7,
      seriesCount: 7,
      cycle: ["M", "A", "N", "DN", "R", "R", "D"],
    },
    v8: {
      id: "v8",
      label: "10h - 8 Séries",
      weeks: 8,
      seriesCount: 8,
      cycle: ["M", "A", "N", "DN", "R", "R", "D", "D"],
    },
  };

  const CUSTOM_VERSION_ID = "custom";
  const CUSTOM_VERSION_LABEL = "Custom";
  const BASE_VERSION_STORAGE_KEY = "horaire10h.baseVersions.v1";
  const SCHEDULE_SETTINGS_STORAGE_KEY = "horaire10h.scheduleSettings.v1";
  const SHIFT_SETTINGS_STORAGE_KEY = "horaire10h.shiftDefinitions.v1";
  const CUSTOM_VERSIONS_STORAGE_KEY = "horaire10h.customVersions.v1";
  const DISPLAY_SETTINGS_STORAGE_KEY = "horaire10h.displaySettings.v1";
  const SHIFT_CODE_PATTERN = /^[A-Z0-9]{1,4}$/;
  const DEFAULT_SHIFT_DEFINITION_LIST = [
    {
      code: "M",
      role: "M",
      label: "Matin",
      color: "#2f6fba",
      startTime: "06:30",
      endTime: "16:30",
      unpaidBreakMinutes: 0,
      isOff: false,
      className: "tag-m",
    },
    {
      code: "A",
      role: "A",
      label: "Après-midi",
      color: "#c35a10",
      startTime: "12:00",
      endTime: "22:00",
      unpaidBreakMinutes: 0,
      isOff: false,
      className: "tag-a",
    },
    {
      code: "N",
      role: "N",
      label: "Nuit",
      color: "#343a66",
      startTime: "21:00",
      endTime: "07:00",
      unpaidBreakMinutes: 0,
      isOff: false,
      className: "tag-n",
    },
    {
      code: "DN",
      role: "DN",
      label: "Descente de nuit",
      color: "#6f6b77",
      isOff: true,
      className: "tag-dn",
    },
    {
      code: "R",
      role: "R",
      label: "Repos",
      color: "#d8d5cc",
      isOff: true,
      className: "tag-r",
    },
    {
      code: "D",
      role: "D",
      label: "Dispo",
      color: "#2e7d54",
      startTime: "08:00",
      endTime: "16:06",
      breakStartTime: "12:00",
      breakEndTime: "12:30",
      isOff: false,
      className: "tag-d",
    },
  ];

  const SHIFT_DEFINITIONS = normalizeShiftDefinitions(DEFAULT_SHIFT_DEFINITION_LIST);
  const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  function normalizeShiftCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);
  }

  function parseTimeToHour(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      return null;
    }
    return hours + minutes / 60;
  }

  function hourToTime(value) {
    if (!Number.isFinite(value)) {
      return "";
    }
    const normalized = ((value % 24) + 24) % 24;
    const hours = Math.floor(normalized);
    const minutes = Math.round((normalized - hours) * 60);
    return `${pad(hours)}:${pad(minutes)}`;
  }

  function normalizeColor(value, fallback = "#6f6b77") {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
  }

  function getNumericOverlapHours(start, end, rangeStart, rangeEnd) {
    const overlap = Math.min(end, rangeEnd) - Math.max(start, rangeStart);
    return overlap > 0 ? overlap : 0;
  }

  function getLegacyBreakMinutes(input) {
    return Math.max(0, Math.round(Number(input.unpaidBreakMinutes || input.breakMinutes || 0)));
  }

  function alignHourToShift(hourValue, shiftStartHour) {
    if (hourValue == null || shiftStartHour == null) {
      return null;
    }
    let aligned = hourValue;
    while (aligned < shiftStartHour) {
      aligned += 24;
    }
    return aligned;
  }

  function alignHourAfter(hourValue, previousHour) {
    if (hourValue == null || previousHour == null) {
      return null;
    }
    let aligned = hourValue;
    while (aligned <= previousHour) {
      aligned += 24;
    }
    return aligned;
  }

  function getReadableTextColor(backgroundColor) {
    const color = normalizeColor(backgroundColor).slice(1);
    const red = Number.parseInt(color.slice(0, 2), 16);
    const green = Number.parseInt(color.slice(2, 4), 16);
    const blue = Number.parseInt(color.slice(4, 6), 16);
    const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
    return luminance >= 145 ? "#24231f" : "#fffdf7";
  }

  function normalizeShiftDefinition(input = {}, index = 0) {
    const code = normalizeShiftCode(input.code) || `P${index + 1}`;
    const isOff = Boolean(input.isOff || input.withoutSchedule);
    const hasStartTimeInput = Object.prototype.hasOwnProperty.call(input, "startTime");
    const hasEndTimeInput = Object.prototype.hasOwnProperty.call(input, "endTime");
    const fallbackStart = input.startTime || hourToTime(input.startHour) || "08:00";
    const fallbackEnd = input.endTime || hourToTime(input.endHour) || "16:00";
    const startTime = isOff ? "" : fallbackStart;
    const endTime = isOff ? "" : fallbackEnd;
    const parsedStart = parseTimeToHour(startTime);
    const parsedEnd = parseTimeToHour(endTime);
    const startHour = isOff
      ? null
      : hasStartTimeInput
        ? parsedStart
        : Number.isFinite(input.startHour)
          ? input.startHour
          : parsedStart;
    let endHour = isOff
      ? null
      : hasEndTimeInput
        ? parsedEnd
        : Number.isFinite(input.endHour)
          ? input.endHour
          : parsedEnd;

    if (!isOff && startHour != null && endHour != null && endHour <= startHour) {
      endHour += 24;
    }

    const durationHours =
      !isOff && startHour != null && endHour != null ? Math.max(0, endHour - startHour) : 0;
    const legacyBreakMinutes = getLegacyBreakMinutes(input);
    const hasBreakStartInput = Object.prototype.hasOwnProperty.call(input, "breakStartTime");
    const hasBreakEndInput = Object.prototype.hasOwnProperty.call(input, "breakEndTime");
    const hasCompleteExplicitBreak = Boolean(input.breakStartTime && input.breakEndTime);
    const hasPartialExplicitBreak =
      (hasBreakStartInput || hasBreakEndInput) && !hasCompleteExplicitBreak;
    let breakStartHour = null;
    let breakEndHour = null;
    let breakStartTime = hasBreakStartInput ? input.breakStartTime || "" : "";
    let breakEndTime = hasBreakEndInput ? input.breakEndTime || "" : "";

    if (!isOff && durationHours > 0 && hasCompleteExplicitBreak) {
      breakStartHour = alignHourToShift(parseTimeToHour(input.breakStartTime), startHour);
      breakEndHour = alignHourAfter(parseTimeToHour(input.breakEndTime), breakStartHour);
      breakStartTime = breakStartHour == null ? "" : hourToTime(breakStartHour);
      breakEndTime = breakEndHour == null ? "" : hourToTime(breakEndHour);
    } else if (!isOff && durationHours > 0 && !hasPartialExplicitBreak && legacyBreakMinutes > 0) {
      const breakDurationHours = Math.min(durationHours, legacyBreakMinutes / 60);
      breakStartHour = startHour + Math.max(0, (durationHours - breakDurationHours) / 2);
      breakEndHour = breakStartHour + breakDurationHours;
      breakStartTime = hourToTime(breakStartHour);
      breakEndTime = hourToTime(breakEndHour);
    }

    const unpaidBreakHours =
      breakStartHour != null && breakEndHour != null
        ? getNumericOverlapHours(startHour, endHour, breakStartHour, breakEndHour)
        : 0;
    const unpaidBreakMinutes = Math.round(unpaidBreakHours * 60);
    const paidHours = Math.max(0, durationHours - unpaidBreakHours);
    const color = normalizeColor(input.color);

    return {
      code,
      role: input.role || code,
      label: String(input.label || input.name || code).trim() || code,
      shortLabel: code,
      color,
      textColor: getReadableTextColor(color),
      startTime: isOff ? "" : hourToTime(startHour),
      endTime: isOff ? "" : hourToTime(endHour),
      startHour,
      endHour,
      breakStartTime: isOff ? "" : breakStartTime,
      breakEndTime: isOff ? "" : breakEndTime,
      breakStartHour,
      breakEndHour,
      unpaidBreakMinutes,
      isOff,
      withoutSchedule: isOff,
      hours: Math.round(paidHours * 10) / 10,
      className: input.className || "tag-dynamic",
    };
  }

  function normalizeShiftDefinitions(input) {
    const source = Array.isArray(input)
      ? input
      : Object.entries(input || {}).map(([code, definition]) => ({ ...definition, code: definition.code || code }));
    const normalized = {};

    source.forEach((definition, index) => {
      const shift = normalizeShiftDefinition(definition, index);
      if (!SHIFT_CODE_PATTERN.test(shift.code) || normalized[shift.code]) {
        return;
      }
      normalized[shift.code] = shift;
    });

    if (Object.keys(normalized).length === 0 && input !== DEFAULT_SHIFT_DEFINITION_LIST) {
      return normalizeShiftDefinitions(DEFAULT_SHIFT_DEFINITION_LIST);
    }

    return normalized;
  }

  function shiftDefinitionsToList(shiftDefinitions = SHIFT_DEFINITIONS) {
    return Object.values(shiftDefinitions).map((shift) => ({
      code: shift.code,
      role: shift.role,
      label: shift.label,
      color: shift.color,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakStartTime: shift.breakStartTime,
      breakEndTime: shift.breakEndTime,
      unpaidBreakMinutes: shift.unpaidBreakMinutes,
      isOff: shift.isOff,
      className: shift.className,
    }));
  }

  function loadShiftDefinitions(storage = globalScope.localStorage) {
    if (!storage || typeof storage.getItem !== "function") {
      return normalizeShiftDefinitions(DEFAULT_SHIFT_DEFINITION_LIST);
    }
    try {
      const rawValue = storage.getItem(SHIFT_SETTINGS_STORAGE_KEY);
      if (!rawValue) {
        return normalizeShiftDefinitions(DEFAULT_SHIFT_DEFINITION_LIST);
      }
      return normalizeShiftDefinitions(JSON.parse(rawValue));
    } catch {
      return normalizeShiftDefinitions(DEFAULT_SHIFT_DEFINITION_LIST);
    }
  }

  function loadActiveShiftDefinitionsForSchedule(scheduleSettings, storage = globalScope.localStorage) {
    if (isCustomVersionId(scheduleSettings?.versionId)) {
      return loadShiftDefinitions(storage);
    }
    return normalizeShiftDefinitions(DEFAULT_SHIFT_DEFINITION_LIST);
  }

  function saveShiftDefinitions(shiftDefinitions, storage = globalScope.localStorage) {
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }
    storage.setItem(SHIFT_SETTINGS_STORAGE_KEY, JSON.stringify(shiftDefinitionsToList(shiftDefinitions)));
  }

  function replaceCycleCode(cycleInput, previousCode, nextCode) {
    return tokenizeCycleInput(cycleInput)
      .map((token) => (token === previousCode ? nextCode : token))
      .join(" ");
  }

  function isShiftUsedInCycle(code, cycleInput) {
    return tokenizeCycleInput(cycleInput).includes(code);
  }

  function removeShiftDefinition(shiftDefinitions, code, cycleInput = "") {
    const normalizedCode = normalizeShiftCode(code);
    const nextDefinitions = normalizeShiftDefinitions(shiftDefinitions);
    if (!nextDefinitions[normalizedCode]) {
      return {
        removed: false,
        message: "Pause introuvable.",
        shiftDefinitions: nextDefinitions,
      };
    }
    if (isShiftUsedInCycle(normalizedCode, cycleInput)) {
      return {
        removed: false,
        message: `${normalizedCode} est encore utilisee dans le cycle.`,
        shiftDefinitions: nextDefinitions,
      };
    }
    if (Object.keys(nextDefinitions).length <= 1) {
      return {
        removed: false,
        message: "Au moins une pause doit rester disponible.",
        shiftDefinitions: nextDefinitions,
      };
    }
    delete nextDefinitions[normalizedCode];
    return {
      removed: true,
      message: `${normalizedCode} supprimée.`,
      shiftDefinitions: nextDefinitions,
    };
  }

  function getShiftDefinition(shiftDefinitions, code) {
    return shiftDefinitions[code] || SHIFT_DEFINITIONS[code] || null;
  }

  function hasShiftRole(shiftDefinitions, code, role) {
    return getShiftDefinition(shiftDefinitions, code)?.role === role;
  }

  function getShiftCodeByRole(shiftDefinitions, role, fallbackCode) {
    return Object.values(shiftDefinitions).find((shift) => shift.role === role)?.code || fallbackCode;
  }

  function getDefaultCycle(definition, shiftDefinitions = SHIFT_DEFINITIONS) {
    return definition.cycle.map((defaultCode) => {
      const defaultRole = SHIFT_DEFINITIONS[defaultCode]?.role || defaultCode;
      const matchingShift = Object.values(shiftDefinitions).find((shift) => shift.role === defaultRole);
      return matchingShift?.code || defaultCode;
    });
  }

  function getShiftTimeLabel(shift) {
    if (!shift || shift.isOff || shift.startHour == null || shift.endHour == null) {
      return "Sans horaire";
    }
    const breakLabel =
      shift.unpaidBreakMinutes > 0 && shift.breakStartTime && shift.breakEndTime
        ? `, pause ${shift.breakStartTime}-${shift.breakEndTime} (${shift.unpaidBreakMinutes} min)`
        : "";
    return `${shift.startTime}-${shift.endTime}${breakLabel}`;
  }

  function getShiftSettingsViewModel(shiftDefinitions, editorOpen = false) {
    const mode = editorOpen ? "edit" : "preview";
    return {
      mode,
      headerActions: editorOpen
        ? [
            { action: "add-shift", label: "Ajouter", variant: "primary" },
            { action: "close-shift-editor", label: "Fermer", variant: "secondary" },
          ]
        : [{ action: "open-shift-editor", label: "Modifier", variant: "primary" }],
      cards: Object.values(shiftDefinitions).map((shift) => ({
        shift,
        code: shift.code,
        label: shift.label,
        timeLabel: getShiftTimeLabel(shift),
        showForm: editorOpen,
        showDelete: editorOpen,
      })),
    };
  }

  function isOfficialVersionId(versionId) {
    return Boolean(VERSION_DEFINITIONS[versionId]);
  }

  function getDefaultVersionId() {
    return VERSION_DEFINITIONS[DEFAULT_VERSION_ID] ? DEFAULT_VERSION_ID : "v7";
  }

  function isCustomVersionId(versionId) {
    const id = String(versionId || "");
    return id === CUSTOM_VERSION_ID || id.startsWith(`${CUSTOM_VERSION_ID}-`);
  }

  function createCustomVersionId() {
    return `${CUSTOM_VERSION_ID}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
  }

  function normalizeCustomVersionName(name, fallback = CUSTOM_VERSION_LABEL) {
    return String(name || "").trim().slice(0, 40) || fallback;
  }

  function normalizeCurrentVersionName(name) {
    return String(name || "")
      .trim()
      .toLocaleLowerCase("fr-BE")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function isCurrentVersionName(name) {
    return normalizeCurrentVersionName(name) === normalizeCurrentVersionName(CURRENT_VERSION_LABEL);
  }

  function getOfficialShiftDefinitions(versionId) {
    const definition = VERSION_DEFINITIONS[versionId] || VERSION_DEFINITIONS[getDefaultVersionId()];
    return normalizeShiftDefinitions(definition.shiftDefinitions || DEFAULT_SHIFT_DEFINITION_LIST);
  }

  function normalizeBaseVersionDefinition(input = {}, fallback = VERSION_DEFINITIONS[getDefaultVersionId()]) {
    const shiftDefinitions = normalizeShiftDefinitions(
      input.shiftDefinitions || fallback.shiftDefinitions || DEFAULT_SHIFT_DEFINITION_LIST,
    );
    const fallbackCycle = Array.isArray(fallback.cycle) ? fallback.cycle : [];
    const parsedCycle = parseCycleInput(
      Array.isArray(input.cycle) ? input.cycle.join(" ") : input.cycle || fallbackCycle.join(" "),
      shiftDefinitions,
    );
    const cycle = parsedCycle.valid ? parsedCycle.cycle : fallbackCycle;
    const seriesCount = parseSeriesCount(input.seriesCount || input.weeks, fallback.seriesCount);

    return {
      id: input.id || fallback.id || getDefaultVersionId(),
      label: normalizeCustomVersionName(input.label || input.name, fallback.label || CURRENT_VERSION_LABEL),
      weeks: seriesCount,
      seriesCount,
      cycle,
      weekendDispoLimit: String(parseWeekendDispoLimit(input.weekendDispoLimit ?? fallback.weekendDispoLimit)),
      seriesOffset: String(parseSeriesOffset(input.seriesOffset ?? fallback.seriesOffset, cycle)),
      shiftDefinitions: shiftDefinitionsToList(shiftDefinitions),
    };
  }

  function createBaseVersionDefinitionFromCustomVersion(customVersion) {
    const normalized = createCustomVersion(customVersion);
    return normalizeBaseVersionDefinition(
      {
        id: DEFAULT_VERSION_ID,
        label: CURRENT_VERSION_LABEL,
        weeks: normalized.scheduleSettings.seriesCount,
        seriesCount: normalized.scheduleSettings.seriesCount,
        cycle: normalized.scheduleSettings.cycle,
        weekendDispoLimit: normalized.scheduleSettings.weekendDispoLimit,
        seriesOffset: normalized.scheduleSettings.seriesOffset,
        shiftDefinitions: normalized.shiftDefinitions,
      },
      VERSION_DEFINITIONS[DEFAULT_VERSION_ID],
    );
  }

  function loadBaseVersionDefinitions(storage = globalScope.localStorage) {
    if (!storage || typeof storage.getItem !== "function") {
      return {};
    }
    try {
      const rawValue = storage.getItem(BASE_VERSION_STORAGE_KEY);
      if (!rawValue) {
        return {};
      }
      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== "object" || !parsed[DEFAULT_VERSION_ID]) {
        return {};
      }
      return {
        [DEFAULT_VERSION_ID]: normalizeBaseVersionDefinition(
          { ...parsed[DEFAULT_VERSION_ID], id: DEFAULT_VERSION_ID, label: CURRENT_VERSION_LABEL },
          VERSION_DEFINITIONS[DEFAULT_VERSION_ID],
        ),
      };
    } catch {
      return {};
    }
  }

  function saveBaseVersionDefinitions(definitions, storage = globalScope.localStorage) {
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }
    const currentDefinition = definitions?.[DEFAULT_VERSION_ID];
    if (!currentDefinition) {
      return;
    }
    storage.setItem(
      BASE_VERSION_STORAGE_KEY,
      JSON.stringify({
        [DEFAULT_VERSION_ID]: normalizeBaseVersionDefinition(
          { ...currentDefinition, id: DEFAULT_VERSION_ID, label: CURRENT_VERSION_LABEL },
          VERSION_DEFINITIONS[DEFAULT_VERSION_ID],
        ),
      }),
    );
  }

  function applyBaseVersionDefinitions(definitions = {}) {
    if (definitions[DEFAULT_VERSION_ID]) {
      VERSION_DEFINITIONS[DEFAULT_VERSION_ID] = normalizeBaseVersionDefinition(
        { ...definitions[DEFAULT_VERSION_ID], id: DEFAULT_VERSION_ID, label: CURRENT_VERSION_LABEL },
        VERSION_DEFINITIONS[DEFAULT_VERSION_ID],
      );
    }
  }

  function promoteCurrentCustomVersionLibrary(library) {
    const normalized = normalizeCustomVersionLibrary(library);
    const currentCustomVersion = normalized.customVersions.find((version) =>
      isCurrentVersionName(version.name),
    );
    if (!currentCustomVersion) {
      return {
        library: normalized,
        versionDefinition: null,
      };
    }
    return {
      library: normalizeCustomVersionLibrary({
        selectedVersionId: DEFAULT_VERSION_ID,
        customVersions: normalized.customVersions.filter(
          (version) => version.id !== currentCustomVersion.id,
        ),
      }),
      versionDefinition: createBaseVersionDefinitionFromCustomVersion(currentCustomVersion),
    };
  }

  function getVersionDefinition(versionId, scheduleSettings = null) {
    if (isCustomVersionId(versionId)) {
      const baseVersion =
        VERSION_DEFINITIONS[scheduleSettings?.baseVersionId] || VERSION_DEFINITIONS[getDefaultVersionId()];
      const seriesCount = parseSeriesCount(scheduleSettings?.seriesCount, baseVersion.seriesCount);
      return {
        ...baseVersion,
        id: versionId,
        label: normalizeCustomVersionName(scheduleSettings?.customName, CUSTOM_VERSION_LABEL),
        weeks: seriesCount,
        seriesCount,
      };
    }
    return VERSION_DEFINITIONS[versionId] || VERSION_DEFINITIONS[getDefaultVersionId()];
  }

  function createScheduleSettingsForVersion(versionId, shiftDefinitions = SHIFT_DEFINITIONS) {
    const definition = VERSION_DEFINITIONS[versionId] || VERSION_DEFINITIONS[getDefaultVersionId()];
    return {
      versionId: definition.id,
      baseVersionId: definition.id,
      weekendDispoLimit: String(parseWeekendDispoLimit(definition.weekendDispoLimit)),
      seriesCount: String(definition.seriesCount),
      seriesOffset: String(parseSeriesOffset(definition.seriesOffset, definition.cycle)),
      cycle: getDefaultCycle(definition, shiftDefinitions).join(" "),
    };
  }

  function createCustomScheduleSettings(currentSettings, updates = {}) {
    const currentVersionId = currentSettings?.versionId || getDefaultVersionId();
    const baseVersionId =
      currentSettings?.baseVersionId ||
      (VERSION_DEFINITIONS[currentVersionId] ? currentVersionId : getDefaultVersionId());
    const { startDate: _currentStartDate, ...currentVersionSettings } = currentSettings || {};
    const { startDate: _updatedStartDate, ...updatedVersionSettings } = updates;
    return {
      ...currentVersionSettings,
      ...updatedVersionSettings,
      versionId: CUSTOM_VERSION_ID,
      baseVersionId,
      customName: normalizeCustomVersionName(updates.customName || currentSettings?.customName, CUSTOM_VERSION_LABEL),
    };
  }

  function normalizeScheduleSettings(input = {}, shiftDefinitions = SHIFT_DEFINITIONS) {
    const requestedVersionId = input.versionId || getDefaultVersionId();
    const baseVersionId =
      input.baseVersionId ||
      (VERSION_DEFINITIONS[requestedVersionId] ? requestedVersionId : getDefaultVersionId());
    const normalizedBaseVersionId = VERSION_DEFINITIONS[baseVersionId] ? baseVersionId : getDefaultVersionId();
    const versionId =
      isCustomVersionId(requestedVersionId)
        ? CUSTOM_VERSION_ID
        : VERSION_DEFINITIONS[requestedVersionId]
          ? requestedVersionId
          : normalizedBaseVersionId;
    const outputVersionId =
      isCustomVersionId(requestedVersionId) ? requestedVersionId : versionId;
    const defaults = createScheduleSettingsForVersion(
      versionId === CUSTOM_VERSION_ID ? normalizedBaseVersionId : versionId,
      shiftDefinitions,
    );
    const cycleInput = input.cycle || defaults.cycle;
    const parsedCycle = parseCycleInput(cycleInput, shiftDefinitions);
    const cycle = parsedCycle.valid ? parsedCycle.cycle.join(" ") : defaults.cycle;
    const cycleLength = cycle.split(" ").filter(Boolean).length;
    const seriesCount =
      versionId === CUSTOM_VERSION_ID
        ? parseSeriesCount(input.seriesCount, defaults.seriesCount)
        : defaults.seriesCount;

    return {
      versionId: outputVersionId,
      baseVersionId: versionId === CUSTOM_VERSION_ID ? normalizedBaseVersionId : versionId,
      customName: isCustomVersionId(outputVersionId)
        ? normalizeCustomVersionName(input.customName, CUSTOM_VERSION_LABEL)
        : undefined,
      weekendDispoLimit: String(parseWeekendDispoLimit(input.weekendDispoLimit)),
      seriesCount: String(seriesCount),
      seriesOffset: String(parseSeriesOffset(input.seriesOffset, { length: cycleLength })),
      cycle,
    };
  }

  function loadScheduleSettings(storage = globalScope.localStorage, shiftDefinitions = SHIFT_DEFINITIONS) {
    if (!storage || typeof storage.getItem !== "function") {
      return createScheduleSettingsForVersion(getDefaultVersionId(), shiftDefinitions);
    }
    try {
      const rawValue = storage.getItem(SCHEDULE_SETTINGS_STORAGE_KEY);
      if (!rawValue) {
        return createScheduleSettingsForVersion(getDefaultVersionId(), shiftDefinitions);
      }
      return normalizeScheduleSettings(JSON.parse(rawValue), shiftDefinitions);
    } catch {
      return createScheduleSettingsForVersion(getDefaultVersionId(), shiftDefinitions);
    }
  }

  function saveScheduleSettings(settings, storage = globalScope.localStorage) {
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }
    storage.setItem(SCHEDULE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }

  function normalizeDisplaySettings(input = {}) {
    return {
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(input.startDate || "")
        ? input.startDate
        : "2026-01-05",
    };
  }

  function loadLegacyDisplaySettings(storage = globalScope.localStorage) {
    if (!storage || typeof storage.getItem !== "function") {
      return normalizeDisplaySettings();
    }
    try {
      const rawValue = storage.getItem(SCHEDULE_SETTINGS_STORAGE_KEY);
      if (!rawValue) {
        return normalizeDisplaySettings();
      }
      return normalizeDisplaySettings(JSON.parse(rawValue));
    } catch {
      return normalizeDisplaySettings();
    }
  }

  function loadDisplaySettings(storage = globalScope.localStorage) {
    if (!storage || typeof storage.getItem !== "function") {
      return normalizeDisplaySettings();
    }
    try {
      const rawValue = storage.getItem(DISPLAY_SETTINGS_STORAGE_KEY);
      if (!rawValue) {
        return loadLegacyDisplaySettings(storage);
      }
      return normalizeDisplaySettings(JSON.parse(rawValue));
    } catch {
      return loadLegacyDisplaySettings(storage);
    }
  }

  function saveDisplaySettings(settings, storage = globalScope.localStorage) {
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }
    storage.setItem(DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeDisplaySettings(settings)));
  }

  function createCustomVersion(input = {}) {
    const name = normalizeCustomVersionName(input.name, CUSTOM_VERSION_LABEL);
    const id = isCustomVersionId(input.id) ? input.id : createCustomVersionId();
    const shiftDefinitions = normalizeShiftDefinitions(
      input.shiftDefinitions || DEFAULT_SHIFT_DEFINITION_LIST,
    );
    const rawScheduleSettings =
      input.scheduleSettings ||
      createScheduleSettingsForVersion(input.baseVersionId || getDefaultVersionId(), shiftDefinitions);
    const baseVersionId =
      input.baseVersionId ||
      rawScheduleSettings.baseVersionId ||
      (isOfficialVersionId(rawScheduleSettings.versionId)
        ? rawScheduleSettings.versionId
        : getDefaultVersionId());
    const scheduleSettings = normalizeScheduleSettings(
      {
        ...rawScheduleSettings,
        versionId: id,
        baseVersionId,
        customName: name,
      },
      shiftDefinitions,
    );

    return {
      id,
      name,
      baseVersionId: scheduleSettings.baseVersionId,
      scheduleSettings,
      shiftDefinitions,
    };
  }

  function customVersionToStorage(version) {
    return {
      id: version.id,
      name: version.name,
      baseVersionId: version.baseVersionId,
      scheduleSettings: version.scheduleSettings,
      shiftDefinitions: shiftDefinitionsToList(version.shiftDefinitions),
    };
  }

  function normalizeCustomVersionLibrary(input = {}) {
    const customVersions = Array.isArray(input.customVersions)
      ? input.customVersions.map((version) => createCustomVersion(version))
      : [];
    const selectedVersionId = String(input.selectedVersionId || "");
    const hasSelectedCustom = customVersions.some((version) => version.id === selectedVersionId);
    const normalizedSelectedVersionId = hasSelectedCustom || isOfficialVersionId(selectedVersionId)
      ? selectedVersionId
      : customVersions[0]?.id || getDefaultVersionId();

    return {
      selectedVersionId: normalizedSelectedVersionId,
      customVersions,
    };
  }

  function migrateLegacyCustomVersionLibrary(storage = globalScope.localStorage) {
    const storedShiftDefinitions = loadShiftDefinitions(storage);
    const storedScheduleSettings = loadScheduleSettings(storage, storedShiftDefinitions);
    if (isCustomVersionId(storedScheduleSettings.versionId)) {
      const customVersion = createCustomVersion({
        id: CUSTOM_VERSION_ID,
        name: CUSTOM_VERSION_LABEL,
        scheduleSettings: storedScheduleSettings,
        shiftDefinitions: storedShiftDefinitions,
      });
      return {
        selectedVersionId: customVersion.id,
        customVersions: [customVersion],
      };
    }

    return {
      selectedVersionId: isOfficialVersionId(storedScheduleSettings.versionId)
        ? storedScheduleSettings.versionId
        : getDefaultVersionId(),
      customVersions: [],
    };
  }

  function loadCustomVersionLibrary(storage = globalScope.localStorage) {
    if (!storage || typeof storage.getItem !== "function") {
      return { selectedVersionId: getDefaultVersionId(), customVersions: [] };
    }
    try {
      const rawValue = storage.getItem(CUSTOM_VERSIONS_STORAGE_KEY);
      if (!rawValue) {
        return migrateLegacyCustomVersionLibrary(storage);
      }
      return normalizeCustomVersionLibrary(JSON.parse(rawValue));
    } catch {
      return migrateLegacyCustomVersionLibrary(storage);
    }
  }

  function saveCustomVersionLibrary(library, storage = globalScope.localStorage) {
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }
    const normalized = normalizeCustomVersionLibrary(library);
    storage.setItem(
      CUSTOM_VERSIONS_STORAGE_KEY,
      JSON.stringify({
        selectedVersionId: normalized.selectedVersionId,
        customVersions: normalized.customVersions.map(customVersionToStorage),
      }),
    );
  }

  function renameCustomVersion(library, versionId, name) {
    const normalized = normalizeCustomVersionLibrary(library);
    return {
      ...normalized,
      customVersions: normalized.customVersions.map((version) =>
        version.id === versionId
          ? createCustomVersion({
              ...version,
              name: normalizeCustomVersionName(name, version.name),
            })
          : version,
      ),
    };
  }

  function deleteCustomVersion(library, versionId) {
    const normalized = normalizeCustomVersionLibrary(library);
    const removedVersion = normalized.customVersions.find((version) => version.id === versionId);
    const customVersions = normalized.customVersions.filter((version) => version.id !== versionId);
    const selectedVersionId =
      normalized.selectedVersionId === versionId
        ? customVersions[0]?.id || removedVersion?.baseVersionId || getDefaultVersionId()
        : normalized.selectedVersionId;

    return normalizeCustomVersionLibrary({
      selectedVersionId,
      customVersions,
    });
  }

  function getVersionActionsViewModel(isCustomSelected, renameEditorRequested = false) {
    const hasCustomSelection = Boolean(isCustomSelected);
    return {
      canRename: hasCustomSelection,
      canDelete: hasCustomSelection,
      renameEditorOpen: hasCustomSelection && Boolean(renameEditorRequested),
    };
  }

  function getScheduleTableSizing(weekCount) {
    const normalizedWeekCount = Math.max(1, Math.round(Number(weekCount) || 1));
    const dayCount = normalizedWeekCount * 7;
    return {
      dayColumnWidth: SCHEDULE_DAY_COLUMN_WIDTH,
      seriesColumnWidth: SCHEDULE_SERIES_COLUMN_WIDTH,
      dayCount,
      tableWidth: SCHEDULE_SERIES_COLUMN_WIDTH + dayCount * SCHEDULE_DAY_COLUMN_WIDTH,
    };
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function parseDateInput(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) {
      return new Date(2026, 0, 5);
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function toDateInputValue(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function atHour(date, hourValue) {
    const daysToAdd = Math.floor(hourValue / 24);
    const hourInDay = hourValue - daysToAdd * 24;
    const hours = Math.floor(hourInDay);
    const minutes = Math.round((hourInDay - hours) * 60);
    const next = addDays(date, daysToAdd);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  function formatDateShort(date) {
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  }

  function formatDateFull(date) {
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  function formatHours(value) {
    const rounded = Math.round(value * 10) / 10;
    return rounded.toLocaleString("fr-BE", {
      minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
      maximumFractionDigits: 1,
    });
  }

  function formatShiftDuration(hours) {
    const totalMinutes = Math.round(hours * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${wholeHours} h` : `${wholeHours} h ${pad(minutes)}`;
  }

  function getWorkedHoursLabel(assignment, workedHours = null, shiftDefinitions = SHIFT_DEFINITIONS) {
    const shift = getShiftDefinition(shiftDefinitions, assignment.code) || SHIFT_DEFINITIONS.R;
    const hours = workedHours ?? (assignment.neutralizedDispo ? 0 : shift.hours);
    const duration = formatShiftDuration(hours);
    return hours > 1 ? `${duration} travaillées` : `${duration} travaillée`;
  }

  function getEasterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function dateKey(date) {
    return toDateInputValue(date);
  }

  function getBelgianHolidays(year) {
    const easter = getEasterDate(year);
    const holidays = [
      new Date(year, 0, 1),
      addDays(easter, 1),
      new Date(year, 4, 1),
      addDays(easter, 39),
      addDays(easter, 50),
      new Date(year, 6, 21),
      new Date(year, 7, 15),
      new Date(year, 10, 1),
      new Date(year, 10, 11),
      new Date(year, 11, 25),
    ];
    return new Set(holidays.map(dateKey));
  }

  function buildHolidaySet(startYear) {
    return new Set([
      ...getBelgianHolidays(startYear - 1),
      ...getBelgianHolidays(startYear),
      ...getBelgianHolidays(startYear + 1),
    ]);
  }

  function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  function isHoliday(date, holidaySet) {
    return holidaySet.has(dateKey(date));
  }

  function isWorkingDay(date, holidaySet) {
    return !isWeekend(date) && !isHoliday(date, holidaySet);
  }

  function parseWeekendDispoLimit(value) {
    const limit = Number.parseInt(value, 10);
    return [0, 1, 2].includes(limit) ? limit : 0;
  }

  function parseSeriesCount(value, fallback = 7) {
    const count = Number.parseInt(value, 10);
    const fallbackCount = Number.parseInt(fallback, 10);
    const safeFallback = Number.isFinite(fallbackCount) ? fallbackCount : 7;
    const normalized = Number.isFinite(count) ? count : safeFallback;
    return Math.min(Math.max(normalized, MIN_SERIES_COUNT), MAX_SERIES_COUNT);
  }

  function getSeriesOffsetMax(cycle) {
    return Math.max(1, cycle.length - 1);
  }

  function parseSeriesOffset(value, cycle) {
    const offset = Number.parseInt(value, 10);
    const max = getSeriesOffsetMax(cycle);
    if (!Number.isFinite(offset)) {
      return 1;
    }
    return Math.min(Math.max(offset, 1), max);
  }

  function tokenizeCycleInput(input) {
    return String(input || "")
      .toUpperCase()
      .replace(/DESCENTE/g, "DN")
      .replace(/REPOS/g, "R")
      .replace(/MATIN/g, "M")
      .replace(/APRES-MIDI|APRÈS-MIDI|APRES MIDI|APRÈS MIDI/g, "A")
      .replace(/NUIT/g, "N")
      .replace(/DISPO/g, "D")
      .split(/[\s,;>/-]+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function parseCycleInput(input, shiftDefinitions = SHIFT_DEFINITIONS) {
    const validCodes = new Set(Object.keys(shiftDefinitions));
    const roleCodeMap = {
      M: getShiftCodeByRole(shiftDefinitions, "M", "M"),
      A: getShiftCodeByRole(shiftDefinitions, "A", "A"),
      N: getShiftCodeByRole(shiftDefinitions, "N", "N"),
      DN: getShiftCodeByRole(shiftDefinitions, "DN", "DN"),
      R: getShiftCodeByRole(shiftDefinitions, "R", "R"),
      D: getShiftCodeByRole(shiftDefinitions, "D", "D"),
    };
    const tokens = String(input || "") ? tokenizeCycleInput(input).map((token) => roleCodeMap[token] || token) : [];
    const invalidTokens = tokens.filter((token) => !validCodes.has(token));
    return {
      valid: tokens.length > 0 && invalidTokens.length === 0,
      cycle: tokens.filter((token) => validCodes.has(token)),
      invalidTokens,
    };
  }

  function normalizeCycle(input, fallbackCycle, shiftDefinitions = SHIFT_DEFINITIONS) {
    const parsed = parseCycleInput(input, shiftDefinitions);
    return parsed.valid ? parsed.cycle : [...fallbackCycle];
  }

  function getPlannedCode(cycle, seriesIndex, dayIndex, seriesOffset = 1) {
    return cycle[(seriesIndex * seriesOffset + dayIndex) % cycle.length];
  }

  function makeDayAssignment(
    cycle,
    seriesIndex,
    dayIndex,
    date,
    holidaySet,
    neutralizedDispo = false,
    seriesOffset = 1,
    neutralizedCode = "R",
  ) {
    const plannedCode = getPlannedCode(cycle, seriesIndex, dayIndex, seriesOffset);
    const code = neutralizedDispo ? neutralizedCode : plannedCode;
    return {
      date,
      dayIndex,
      seriesIndex,
      plannedCode,
      code,
      neutralizedDispo,
      holiday: isHoliday(date, holidaySet),
      weekend: isWeekend(date),
      workingDay: isWorkingDay(date, holidaySet),
    };
  }

  function makeDayAssignments(
    cycle,
    series,
    dayIndex,
    date,
    holidaySet,
    weekendDispoLimit,
    seriesOffset,
    shiftDefinitions = SHIFT_DEFINITIONS,
  ) {
    const holiday = isHoliday(date, holidaySet);
    const weekend = isWeekend(date);
    let keptWeekendDispos = 0;

    return series.map((serie) => {
      const plannedCode = getPlannedCode(cycle, serie.index, dayIndex, seriesOffset);
      let neutralizedDispo = false;

      if (hasShiftRole(shiftDefinitions, plannedCode, "D")) {
        if (holiday) {
          neutralizedDispo = true;
        } else if (weekend) {
          neutralizedDispo = keptWeekendDispos >= weekendDispoLimit;
          if (!neutralizedDispo) {
            keptWeekendDispos += 1;
          }
        }
      }

      return makeDayAssignment(
        cycle,
        serie.index,
        dayIndex,
        date,
        holidaySet,
        neutralizedDispo,
        seriesOffset,
        getShiftCodeByRole(shiftDefinitions, "R", "R"),
      );
    });
  }

  function buildAssignments(
    definition,
    startDate,
    cycle,
    days,
    weekendDispoLimit = 0,
    seriesOffset = 1,
    shiftDefinitions = SHIFT_DEFINITIONS,
  ) {
    const holidaySet = buildHolidaySet(startDate.getFullYear());
    const series = Array.from({ length: definition.seriesCount }, (_, index) => ({
      id: `S${pad(index + 1)}`,
      index,
    }));
    const parsedWeekendDispoLimit = parseWeekendDispoLimit(weekendDispoLimit);
    const parsedSeriesOffset = parseSeriesOffset(seriesOffset, cycle);
    return {
      holidaySet,
      shiftDefinitions,
      series,
      days: Array.from({ length: days }, (_, dayIndex) => {
        const date = addDays(startDate, dayIndex);
        return {
          date,
          dayIndex,
          assignments: makeDayAssignments(
            cycle,
            series,
            dayIndex,
            date,
          holidaySet,
          parsedWeekendDispoLimit,
          parsedSeriesOffset,
          shiftDefinitions,
        ),
      };
    }),
    };
  }

  function makeShiftEvent(assignment, shiftDefinitions = SHIFT_DEFINITIONS) {
    const shift = getShiftDefinition(shiftDefinitions, assignment.code);
    if (!shift || shift.isOff || shift.startHour == null || assignment.neutralizedDispo) {
      return null;
    }
    const start = atHour(assignment.date, shift.startHour);
    const end = atHour(assignment.date, shift.endHour);
    const durationHours = (end.getTime() - start.getTime()) / HOUR;
    const breakStart = shift.breakStartHour == null ? null : atHour(assignment.date, shift.breakStartHour);
    const breakEnd = shift.breakEndHour == null ? null : atHour(assignment.date, shift.breakEndHour);
    const rawBreakInterval = breakStart && breakEnd ? { start: breakStart, end: breakEnd } : null;
    const breakHours = rawBreakInterval
      ? getOverlapHours(start.getTime(), end.getTime(), rawBreakInterval)
      : 0;
    const breakInterval = breakHours > 0 ? rawBreakInterval : null;
    const paidHours = Math.max(
      0,
      durationHours - breakHours,
    );
    return {
      seriesIndex: assignment.seriesIndex,
      code: assignment.code,
      plannedCode: assignment.plannedCode,
      start,
      end,
      breakStart,
      breakEnd,
      dayIndex: assignment.dayIndex,
      hours: Math.round(paidHours * 10) / 10,
      durationHours,
      nightHours: getNightHoursForShift(start, end, breakInterval),
      weekendHours: getWeekendHoursForShift(start, end, breakInterval),
    };
  }

  function getPaidOverlapHours(startMs, endMs, event) {
    const workedOverlap = getOverlapHours(startMs, endMs, event);
    if (!event.breakStart || !event.breakEnd) {
      return workedOverlap;
    }
    const breakOverlap = getOverlapHours(startMs, endMs, {
      start: event.breakStart,
      end: event.breakEnd,
    });
    return Math.max(0, workedOverlap - breakOverlap);
  }

  function getNightHoursForShift(start, end, breakInterval = null) {
    let cursorDay = addDays(start, -1);
    let nightHours = 0;
    while (cursorDay < end) {
      const nightStart = atHour(cursorDay, 22);
      const nightEnd = atHour(cursorDay, 30);
      nightHours += getOverlapHours(nightStart.getTime(), nightEnd.getTime(), { start, end });
      if (breakInterval) {
        nightHours -= getOverlapHours(
          nightStart.getTime(),
          nightEnd.getTime(),
          {
            start: breakInterval.start,
            end: breakInterval.end,
          },
        );
      }
      cursorDay = addDays(cursorDay, 1);
    }
    return Math.max(0, Math.round(nightHours * 10) / 10);
  }

  function getCalendarWorkedHours(assignments, seriesIndex, dayIndex) {
    const total = getCalendarWorkSegments(assignments, seriesIndex, dayIndex).reduce(
      (sum, segment) => sum + segment.hours,
      0,
    );
    return Math.round(total * 10) / 10;
  }

  function getCalendarWorkSegments(assignments, seriesIndex, dayIndex) {
    const day = assignments.days[dayIndex];
    if (!day) {
      return [];
    }
    const startMs = day.date.getTime();
    const endMs = addDays(day.date, 1).getTime();
    const segments = [];
    [dayIndex - 1, dayIndex].forEach((candidateIndex) => {
      const candidateDay = assignments.days[candidateIndex];
      const assignment = candidateDay?.assignments[seriesIndex];
      if (!assignment) {
        return;
      }
      const event = makeShiftEvent(assignment, assignments.shiftDefinitions);
      if (!event) {
        return;
      }
      const hours = getPaidOverlapHours(startMs, endMs, event);
      if (hours <= 0) {
        return;
      }
      segments.push({
        code: event.code,
        plannedCode: event.plannedCode,
        sourceDayIndex: event.dayIndex,
        targetDayIndex: dayIndex,
        hours: Math.round(hours * 10) / 10,
      });
    });
    return segments;
  }

  function buildEvents(assignments, seriesCount, shiftDefinitions = assignments.shiftDefinitions || SHIFT_DEFINITIONS) {
    const eventsBySeries = Array.from({ length: seriesCount }, () => []);
    assignments.days.forEach((day) => {
      day.assignments.forEach((assignment) => {
        const event = makeShiftEvent(assignment, shiftDefinitions);
        if (event) {
          eventsBySeries[assignment.seriesIndex].push(event);
        }
      });
    });
    return eventsBySeries;
  }

  function getWeekendHoursForShift(start, end, breakInterval = null) {
    let cursor = new Date(start);
    const stop = new Date(end);
    let weekendHours = 0;
    while (cursor < stop) {
      const nextMidnight = new Date(cursor);
      nextMidnight.setHours(24, 0, 0, 0);
      const segmentEnd = nextMidnight < stop ? nextMidnight : stop;
      if (isWeekend(cursor)) {
        weekendHours += (segmentEnd.getTime() - cursor.getTime()) / HOUR;
        if (breakInterval) {
          weekendHours -= getOverlapHours(cursor.getTime(), segmentEnd.getTime(), {
            start: breakInterval.start,
            end: breakInterval.end,
          });
        }
      }
      cursor = segmentEnd;
    }
    return Math.max(0, Math.round(weekendHours * 10) / 10);
  }

  function getOverlapHours(startMs, endMs, event) {
    const overlap = Math.min(endMs, event.end.getTime()) - Math.max(startMs, event.start.getTime());
    return overlap > 0 ? overlap / HOUR : 0;
  }

  function getMaxRollingHours(events, windowHours) {
    const anchors = new Set();
    events.forEach((event) => {
      anchors.add(event.start.getTime());
      anchors.add(event.end.getTime() - windowHours * HOUR);
    });
    let max = 0;
    anchors.forEach((anchor) => {
      const end = anchor + windowHours * HOUR;
      const total = events.reduce((sum, event) => sum + getPaidOverlapHours(anchor, end, event), 0);
      max = Math.max(max, total);
    });
    return Math.round(max * 10) / 10;
  }

  function countWeekendWork(events) {
    const weekendKeys = new Set();
    events.forEach((event) => {
      if (event.weekendHours <= 0) {
        return;
      }
      const cursor = new Date(event.start);
      while (cursor < event.end) {
        if (isWeekend(cursor)) {
          const saturday = addDays(cursor, cursor.getDay() === 0 ? -1 : 0);
          weekendKeys.add(dateKey(saturday));
        }
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(0, 0, 0, 0);
      }
    });
    return weekendKeys.size;
  }

  function countMaxConsecutiveDays(assignments, seriesIndex, predicate) {
    let current = 0;
    let max = 0;
    assignments.days.forEach((day) => {
      const assignment = day.assignments[seriesIndex];
      if (predicate(assignment)) {
        current += 1;
        max = Math.max(max, current);
      } else {
        current = 0;
      }
    });
    return max;
  }

  function isWorkedAssignment(assignment, shiftDefinitions = SHIFT_DEFINITIONS) {
    const shift = getShiftDefinition(shiftDefinitions, assignment.code);
    return Boolean(shift && !shift.isOff && shift.startHour != null);
  }

  function analyzeConsecutiveWorkRest(assignments, shiftDefinitions = assignments.shiftDefinitions || SHIFT_DEFINITIONS) {
    const summary = {
      maxConsecutiveWorkDays: 0,
      twoRestViolations: [],
      singleRestViolations: [],
    };

    assignments.series.forEach((serie) => {
      let dayIndex = 0;
      while (dayIndex < assignments.days.length) {
        const assignment = assignments.days[dayIndex].assignments[serie.index];
        if (!isWorkedAssignment(assignment, shiftDefinitions)) {
          dayIndex += 1;
          continue;
        }

        const runStartIndex = dayIndex;
        while (
          dayIndex < assignments.days.length &&
          isWorkedAssignment(assignments.days[dayIndex].assignments[serie.index], shiftDefinitions)
        ) {
          dayIndex += 1;
        }

        const runLength = dayIndex - runStartIndex;
        const runStartDate = assignments.days[runStartIndex].date;
        summary.maxConsecutiveWorkDays = Math.max(summary.maxConsecutiveWorkDays, runLength);

        let restCount = 0;
        let restIndex = dayIndex;
        while (
          restIndex < assignments.days.length &&
          !isWorkedAssignment(assignments.days[restIndex].assignments[serie.index], shiftDefinitions) &&
          restCount < 2
        ) {
          restCount += 1;
          restIndex += 1;
        }

        const resumesAfterRest =
          restIndex < assignments.days.length &&
          isWorkedAssignment(assignments.days[restIndex].assignments[serie.index], shiftDefinitions);

        if (runLength > MAX_CONSECUTIVE_WORK_DAYS) {
          summary.twoRestViolations.push(
            `${serie.id} ${formatDateShort(runStartDate)} : ${runLength} jours consécutifs`,
          );
        } else if (
          runLength === MAX_CONSECUTIVE_WORK_DAYS &&
          restCount < 2 &&
          resumesAfterRest
        ) {
          summary.twoRestViolations.push(
            `${serie.id} ${formatDateShort(runStartDate)} : ${restCount} jour(s) de repos après 10 jours`,
          );
        }

        if (
          runLength > MAX_WORK_DAYS_BEFORE_SINGLE_REST &&
          restCount === 1 &&
          resumesAfterRest
        ) {
          summary.singleRestViolations.push(
            `${serie.id} ${formatDateShort(runStartDate)} : ${runLength} jours puis 1 repos`,
          );
        }
      }
    });

    return summary;
  }

  function makeStats(assignments, eventsBySeries, horizonDays, shiftDefinitions = assignments.shiftDefinitions || SHIFT_DEFINITIONS) {
    const weeks = horizonDays / 7;
    return assignments.series.map((serie) => {
      const events = eventsBySeries[serie.index];
      const totalHours = events.reduce((sum, event) => sum + event.hours, 0);
      const nightCount = events.filter((event) => hasShiftRole(shiftDefinitions, event.code, "N")).length;
      const nightHoursYear = events.reduce((sum, event) => sum + event.nightHours, 0);
      const weekendWorkedYear = countWeekendWork(events);
      const weekendHoursYear = events.reduce((sum, event) => sum + event.weekendHours, 0);
      const max24Hours = getMaxRollingHours(events, 24);
      const max168Hours = getMaxRollingHours(events, 168);
      const maxConsecutiveWorkDays = countMaxConsecutiveDays(
        assignments,
        serie.index,
        (assignment) => isWorkedAssignment(assignment, shiftDefinitions),
      );
      const maxConsecutiveNights = countMaxConsecutiveDays(
        assignments,
        serie.index,
        (assignment) => hasShiftRole(shiftDefinitions, assignment.code, "N"),
      );
      return {
        seriesId: serie.id,
        totalHours,
        averageWeeklyHours: totalHours / weeks,
        nightCount,
        nightHoursYear,
        weekendWorkedYear,
        weekendFreeYear: 52 - weekendWorkedYear,
        weekendHoursYear,
        weekendHoursMonth: weekendHoursYear / 12,
        max24Hours,
        max168Hours,
        maxConsecutiveWorkDays,
        maxConsecutiveNights,
      };
    });
  }

  function getWorst(stats, key) {
    return stats.reduce((max, row) => Math.max(max, row[key]), 0);
  }

  function addRule(rules, category, id, title, passed, detail, warning) {
    rules.push({
      id,
      category,
      title,
      status: passed ? "pass" : warning ? "warn" : "fail",
      detail,
    });
  }

  function getRuleStatusText(status) {
    if (status === "pass") {
      return "OK";
    }
    if (status === "warn") {
      return "OK avec dérogation";
    }
    return "Échec";
  }

  function checkNightFollowedByDn(assignments, shiftDefinitions = assignments.shiftDefinitions || SHIFT_DEFINITIONS) {
    const violations = [];
    assignments.series.forEach((serie) => {
      for (let dayIndex = 0; dayIndex < assignments.days.length - 1; dayIndex += 1) {
        const current = assignments.days[dayIndex].assignments[serie.index];
        const next = assignments.days[dayIndex + 1].assignments[serie.index];
        if (
          hasShiftRole(shiftDefinitions, current.code, "N") &&
          !hasShiftRole(shiftDefinitions, next.code, "N") &&
          !hasShiftRole(shiftDefinitions, next.plannedCode, "DN")
        ) {
          violations.push(`${serie.id} ${formatDateShort(next.date)}`);
          break;
        }
      }
    });
    return violations;
  }

  function checkTransition(assignments, predicate) {
    const violations = [];
    assignments.series.forEach((serie) => {
      for (let dayIndex = 1; dayIndex < assignments.days.length; dayIndex += 1) {
        const previous = assignments.days[dayIndex - 1].assignments[serie.index];
        const current = assignments.days[dayIndex].assignments[serie.index];
        const beforePrevious =
          dayIndex > 1 ? assignments.days[dayIndex - 2].assignments[serie.index] : null;
        if (predicate(previous, current, beforePrevious)) {
          violations.push(`${serie.id} ${formatDateShort(current.date)}`);
          break;
        }
      }
    });
    return violations;
  }

  function countWeekdayDispoIssues(assignments, shiftDefinitions = assignments.shiftDefinitions || SHIFT_DEFINITIONS) {
    return assignments.days.filter((day) => {
      if (!isWorkingDay(day.date, assignments.holidaySet)) {
        return false;
      }
      const dispoCount = day.assignments.filter((assignment) =>
        hasShiftRole(shiftDefinitions, assignment.code, "D"),
      ).length;
      return dispoCount < 2;
    });
  }

  function countDailyCoverageIssues(assignments, role, shiftDefinitions = assignments.shiftDefinitions || SHIFT_DEFINITIONS) {
    return assignments.days
      .map((day) => ({
        date: day.date,
        count: day.assignments.filter((assignment) => hasShiftRole(shiftDefinitions, assignment.code, role)).length,
      }))
      .filter((day) => day.count !== 1);
  }

  function formatDailyCoverageDetail(issues, label) {
    if (issues.length === 0) {
      return `Chaque jour a exactement une série en ${label}.`;
    }
    const firstIssue = issues[0];
    return `${issues.length} jour(s) avec ${firstIssue.count} série(s) en ${label}. Premier cas : ${formatDateShort(firstIssue.date)}.`;
  }

  function getNonWorkingDispoSummary(
    assignments,
    weekendDispoLimit,
    shiftDefinitions = assignments.shiftDefinitions || SHIFT_DEFINITIONS,
  ) {
    return assignments.days.reduce(
      (summary, day) => {
        const dayWeekendDispos = day.assignments.filter(
          (assignment) =>
            assignment.weekend &&
            hasShiftRole(shiftDefinitions, assignment.plannedCode, "D") &&
            hasShiftRole(shiftDefinitions, assignment.code, "D"),
        ).length;
        const holidayDispos = day.assignments.filter(
          (assignment) =>
            assignment.holiday &&
            hasShiftRole(shiftDefinitions, assignment.plannedCode, "D") &&
            hasShiftRole(shiftDefinitions, assignment.code, "D"),
        ).length;

        return {
          neutralizedDispos:
            summary.neutralizedDispos +
            day.assignments.filter((assignment) => assignment.neutralizedDispo).length,
          weekendDispos: summary.weekendDispos + dayWeekendDispos,
          holidayDispos: summary.holidayDispos + holidayDispos,
          maxWeekendDispos: Math.max(summary.maxWeekendDispos, dayWeekendDispos),
          overLimitDays:
            summary.overLimitDays + (dayWeekendDispos > weekendDispoLimit || holidayDispos > 0 ? 1 : 0),
        };
      },
      {
        neutralizedDispos: 0,
        weekendDispos: 0,
        holidayDispos: 0,
        maxWeekendDispos: 0,
        overLimitDays: 0,
      },
    );
  }

  function buildRules(
    assignments,
    stats,
    eventsBySeries,
    weekendDispoLimit,
    shiftDefinitions = assignments.shiftDefinitions || SHIFT_DEFINITIONS,
  ) {
    const rules = [];
    const maxAverage = getWorst(stats, "averageWeeklyHours");
    const max24 = getWorst(stats, "max24Hours");
    const max168 = getWorst(stats, "max168Hours");
    const consecutiveWorkRest = analyzeConsecutiveWorkRest(assignments, shiftDefinitions);
    const maxConsecutiveNights = getWorst(stats, "maxConsecutiveNights");
    const maxWeekendWorked = getWorst(stats, "weekendWorkedYear");
    const maxNights = getWorst(stats, "nightCount");
    const maxNightHours = getWorst(stats, "nightHoursYear");
    const nightDnViolations = checkNightFollowedByDn(assignments, shiftDefinitions);
    const morningAfterDn = checkTransition(
      assignments,
      (previous, current) =>
        hasShiftRole(shiftDefinitions, previous.plannedCode, "DN") &&
        hasShiftRole(shiftDefinitions, current.code, "M"),
    );
    const dispoAfterMultiNightDn = checkTransition(assignments, (previous, current, beforePrevious) => {
      return (
        hasShiftRole(shiftDefinitions, previous.plannedCode, "DN") &&
        beforePrevious &&
        hasShiftRole(shiftDefinitions, beforePrevious.code, "N") &&
        hasShiftRole(shiftDefinitions, current.code, "D")
      );
    });
    const weekdayDispoIssues = countWeekdayDispoIssues(assignments, shiftDefinitions);
    const morningCoverageIssues = countDailyCoverageIssues(assignments, "M", shiftDefinitions);
    const afternoonCoverageIssues = countDailyCoverageIssues(assignments, "A", shiftDefinitions);
    const nightCoverageIssues = countDailyCoverageIssues(assignments, "N", shiftDefinitions);
    const nonWorkingDispoSummary = getNonWorkingDispoSummary(assignments, weekendDispoLimit, shiftDefinitions);

    addRule(
      rules,
      "pjpol",
      "average-weekly",
      "Moyenne 38 h/semaine",
      maxAverage <= 38,
      `Maximum observé : ${formatHours(maxAverage)} h/semaine.`,
    );
    addRule(
      rules,
      "pjpol",
      "daily-limit",
      "Maximum 12 h par 24 h",
      max24 <= 12,
      `Maximum glissant observé : ${formatHours(max24)} h.`,
    );
    addRule(
      rules,
      "pjpol",
      "weekly-limit",
      "Maximum 50 h sur 7 jours",
      max168 <= 50,
      `Maximum glissant observé : ${formatHours(max168)} h.`,
    );
    addRule(
      rules,
      "pjpol",
      "daily-rest",
      "Repos de 11 h entre prestations",
      checkRestViolations(eventsBySeries).length === 0,
      checkRestViolations(eventsBySeries).length === 0
        ? "Aucune reprise sous 11 h."
        : `Première alerte : ${checkRestViolations(eventsBySeries)[0]}.`,
    );
    addRule(
      rules,
      "pjpol",
      "consecutive-work",
      "Maximum 10 jours puis 2 repos",
      consecutiveWorkRest.twoRestViolations.length === 0,
      consecutiveWorkRest.twoRestViolations.length === 0
        ? `Maximum observé : ${consecutiveWorkRest.maxConsecutiveWorkDays} jours, avec 2 repos après 10 jours.`
        : `Première alerte : ${consecutiveWorkRest.twoRestViolations[0]}.`,
    );
    addRule(
      rules,
      "pjpol",
      "single-rest-work-limit",
      "Maximum 9 jours avant 1 repos",
      consecutiveWorkRest.singleRestViolations.length === 0,
      consecutiveWorkRest.singleRestViolations.length === 0
        ? "Aucune reprise après un seul repos ne suit plus de 9 jours travaillés."
        : `Première alerte : ${consecutiveWorkRest.singleRestViolations[0]}.`,
    );
    addRule(
      rules,
      "internal",
      "consecutive-nights",
      "Maximum 3 nuits consécutives",
      maxConsecutiveNights <= 3,
      `Maximum observé : ${maxConsecutiveNights} nuit(s).`,
    );
    addRule(
      rules,
      "internal",
      "night-dn",
      "Nuit isolée suivie d'une DN",
      nightDnViolations.length === 0,
      nightDnViolations.length === 0
        ? "Toutes les nuits isolées sont suivies d'une descente."
        : `Exemple : ${nightDnViolations[0]}.`,
    );
    addRule(
      rules,
      "internal",
      "morning-after-dn",
      "Pas de Matin après DN",
      morningAfterDn.length === 0,
      morningAfterDn.length === 0 ? "Aucun enchaînement DN -> M." : `Exemple : ${morningAfterDn[0]}.`,
    );
    addRule(
      rules,
      "internal",
      "dispo-after-multi-night",
      "Pas de Dispo après DN de plusieurs nuits",
      dispoAfterMultiNightDn.length === 0,
      dispoAfterMultiNightDn.length === 0
        ? "Aucun cas détecté."
        : `Exemple : ${dispoAfterMultiNightDn[0]}.`,
    );
    addRule(
      rules,
      "internal",
      "daily-morning-coverage",
      "Un Matin par jour",
      morningCoverageIssues.length === 0,
      formatDailyCoverageDetail(morningCoverageIssues, "Matin"),
    );
    addRule(
      rules,
      "internal",
      "daily-afternoon-coverage",
      "Un Après-midi par jour",
      afternoonCoverageIssues.length === 0,
      formatDailyCoverageDetail(afternoonCoverageIssues, "Après-midi"),
    );
    addRule(
      rules,
      "internal",
      "daily-night-coverage",
      "Une Nuit par jour",
      nightCoverageIssues.length === 0,
      formatDailyCoverageDetail(nightCoverageIssues, "Nuit"),
    );
    addRule(
      rules,
      "internal",
      "dispo-non-working",
      weekendDispoLimit === 0 ? "Pas de Dispo week-end ou jour férié" : "Dispo week-end selon réglage",
      nonWorkingDispoSummary.overLimitDays === 0,
      `Réglage : ${weekendDispoLimit} Dispo maximum par jour de week-end. ${nonWorkingDispoSummary.weekendDispos} Dispo week-end conservée(s), ${nonWorkingDispoSummary.neutralizedDispos} transformée(s) en repos effectif.`,
    );
    addRule(
      rules,
      "internal",
      "weekday-dispo",
      "Au moins 2 Dispo par jour ouvrable",
      weekdayDispoIssues.length === 0,
      weekdayDispoIssues.length === 0
        ? "Chaque jour ouvrable a au moins deux séries en Dispo."
        : `${weekdayDispoIssues.length} jour(s) ouvrable(s) sous le seuil.`,
    );
    addRule(
      rules,
      "pjpol",
      "weekend-free",
      "Maximum 28 week-ends travaillés",
      maxWeekendWorked <= STANDARD_MAX_WORKED_WEEKENDS,
      `Maximum observé : ${maxWeekendWorked} week-end(s) travaillé(s). Limite standard PJPol : ${STANDARD_MAX_WORKED_WEEKENDS}/an, extensible à ${EXTENDED_MAX_WORKED_WEEKENDS}/an selon accord/concertation.`,
      maxWeekendWorked <= EXTENDED_MAX_WORKED_WEEKENDS,
    );
    addRule(
      rules,
      "pjpol",
      "night-hours-cap",
      "Maximum 400 h de nuit",
      maxNightHours <= STANDARD_MAX_NIGHT_HOURS,
      `Maximum annuel observé : ${formatHours(maxNightHours)} h de nuit. Limite standard PJPol : ${STANDARD_MAX_NIGHT_HOURS} h/an, extensible à ${EXTENDED_MAX_NIGHT_HOURS} h/an selon accord/concertation.`,
      maxNightHours <= EXTENDED_MAX_NIGHT_HOURS,
    );
    addRule(
      rules,
      "pjpol",
      "night-count-cap",
      "Maximum 70 nuits par an",
      maxNights <= STANDARD_MAX_NIGHT_COUNT,
      `Maximum annuel observé : ${maxNights} nuit(s). Limite standard PJPol : ${STANDARD_MAX_NIGHT_COUNT} nuit(s)/an, extensible à ${EXTENDED_MAX_NIGHT_COUNT} nuit(s)/an selon accord/concertation.`,
      maxNights <= EXTENDED_MAX_NIGHT_COUNT,
    );
    return rules;
  }

  function checkRestViolations(eventsBySeries) {
    const violations = [];
    eventsBySeries.forEach((events, seriesIndex) => {
      for (let index = 1; index < events.length; index += 1) {
        const rest = (events[index].start.getTime() - events[index - 1].end.getTime()) / HOUR;
        if (rest < 11) {
          violations.push(`S${pad(seriesIndex + 1)} ${formatHours(rest)} h`);
          break;
        }
      }
    });
    return violations;
  }

  function makeDisplayWeeks(assignments, weeks) {
    return Array.from({ length: weeks }, (_, weekIndex) => {
      const start = weekIndex * 7;
      return assignments.days.slice(start, start + 7);
    });
  }

  function createSimulation(versionId, options = {}) {
    const definition = getVersionDefinition(versionId, options.scheduleSettings);
    const shiftDefinitions = options.shiftDefinitions
      ? normalizeShiftDefinitions(options.shiftDefinitions)
      : definition.shiftDefinitions
        ? getOfficialShiftDefinitions(definition.id)
        : SHIFT_DEFINITIONS;
    const startDate = parseDateInput(options.startDate || "2026-01-05");
    const defaultCycle = getDefaultCycle(definition, shiftDefinitions);
    const cycle = normalizeCycle(options.cycle || defaultCycle.join(" "), defaultCycle, shiftDefinitions);
    const weekendDispoLimit = parseWeekendDispoLimit(options.weekendDispoLimit);
    const seriesOffset = parseSeriesOffset(options.seriesOffset, cycle);
    const displayDays = definition.weeks * 7;
    const yearDays = new Date(startDate.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365;
    const displayAssignments = buildAssignments(
      definition,
      startDate,
      cycle,
      displayDays,
      weekendDispoLimit,
      seriesOffset,
      shiftDefinitions,
    );
    const annualAssignments = buildAssignments(
      definition,
      startDate,
      cycle,
      yearDays,
      weekendDispoLimit,
      seriesOffset,
      shiftDefinitions,
    );
    const annualEvents = buildEvents(annualAssignments, definition.seriesCount, shiftDefinitions);
    const stats = makeStats(annualAssignments, annualEvents, yearDays, shiftDefinitions);
    const rules = buildRules(annualAssignments, stats, annualEvents, weekendDispoLimit, shiftDefinitions);
    const periodEnd = addDays(startDate, yearDays - 1);
    const completeDisplayCycles = Math.floor(yearDays / displayDays);
    return {
      version: definition,
      shiftDefinitions,
      cycle,
      startDate,
      weekendDispoLimit,
      seriesOffset,
      period: {
        days: yearDays,
        startLabel: formatDateFull(startDate),
        endLabel: formatDateFull(periodEnd),
        completeDisplayCycles,
        remainingDays: yearDays - completeDisplayCycles * displayDays,
      },
      series: displayAssignments.series,
      weeks: makeDisplayWeeks(displayAssignments, definition.weeks),
      stats,
      rules,
      displayAssignments,
      annualAssignments,
    };
  }

  function getWorkedHoursSourceLabel(
    assignment,
    workSegments = [],
    shiftDefinitions = SHIFT_DEFINITIONS,
  ) {
    if (assignment.neutralizedDispo) {
      return "Dispo neutralisée";
    }
    if (workSegments.length === 0) {
      return getShiftDefinition(shiftDefinitions, assignment.code)?.label || assignment.code;
    }
    const labels = workSegments.map((segment) => {
      if (
        hasShiftRole(shiftDefinitions, segment.code, "N") &&
        segment.sourceDayIndex < assignment.dayIndex
      ) {
        return "Nuit précédente";
      }
      return (
        getShiftDefinition(shiftDefinitions, segment.code)?.label ||
        getShiftDefinition(shiftDefinitions, assignment.code)?.label ||
        assignment.code
      );
    });
    return [...new Set(labels)].join(" + ");
  }

  function makeTag(assignment, workedHours = null, workSegments = [], shiftDefinitions = SHIFT_DEFINITIONS) {
    const shift = getShiftDefinition(shiftDefinitions, assignment.code) || SHIFT_DEFINITIONS.R;
    const sourceLabel = getWorkedHoursSourceLabel(assignment, workSegments, shiftDefinitions);
    const tag = document.createElement("b");
    tag.className = `tag ${shift.className || "tag-dynamic"}${assignment.neutralizedDispo ? " tag-neutralized" : ""}`;
    tag.style.setProperty("--shift-color", shift.color);
    tag.style.setProperty("--shift-text-color", shift.textColor);
    tag.textContent = assignment.neutralizedDispo ? "R*" : shift.shortLabel;
    tag.dataset.hours = getWorkedHoursLabel(assignment, workedHours, shiftDefinitions);
    tag.dataset.source = sourceLabel;
    tag.tabIndex = 0;
    tag.title = assignment.neutralizedDispo
      ? `Dispo neutralisée en repos effectif - ${tag.dataset.hours}`
      : `${sourceLabel} - ${tag.dataset.hours}`;
    tag.setAttribute("aria-label", tag.title);
    return tag;
  }

  function makeShiftPreviewTag(shift) {
    const tag = document.createElement("b");
    tag.className = `tag ${shift.className || "tag-dynamic"}`;
    tag.style.setProperty("--shift-color", shift.color);
    tag.style.setProperty("--shift-text-color", shift.textColor);
    tag.textContent = shift.shortLabel;
    return tag;
  }

  function makeShiftField(labelText, input) {
    const label = document.createElement("label");
    label.className = "shift-field";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = labelText;
    label.append(labelSpan, input);
    return label;
  }

  function makeShiftInput(type, field, value) {
    const input = document.createElement("input");
    input.type = type;
    input.dataset.field = field;
    if (type === "checkbox") {
      input.checked = Boolean(value);
    } else {
      input.value = value ?? "";
    }
    return input;
  }

  function renderShiftSettings(shiftDefinitions, editorOpen = false) {
    const actionsContainer = document.getElementById("legendActions");
    const list = document.getElementById("legendList");
    if (!list) {
      return;
    }

    const viewModel = getShiftSettingsViewModel(shiftDefinitions, editorOpen);
    if (actionsContainer) {
      actionsContainer.replaceChildren(
        ...viewModel.headerActions.map((action) => {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.action = action.action;
          button.textContent = action.label;
          if (action.variant === "secondary") {
            button.className = "secondary";
          }
          return button;
        }),
      );
    }

    list.dataset.mode = viewModel.mode;
    list.replaceChildren();
    viewModel.cards.forEach((cardModel) => {
      const { shift } = cardModel;
      const card = document.createElement("article");
      card.className = "shift-card";
      card.dataset.mode = viewModel.mode;
      card.dataset.code = shift.code;

      const summary = document.createElement("div");
      summary.className = "shift-summary";

      const identity = document.createElement("div");
      identity.className = "shift-identity";
      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = shift.label;
      const meta = document.createElement("span");
      meta.textContent = cardModel.timeLabel;
      text.append(title, meta);
      identity.append(makeShiftPreviewTag(shift), text);

      const actions = document.createElement("div");
      actions.className = "shift-actions";
      if (cardModel.showDelete) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "secondary danger";
        deleteButton.dataset.action = "delete-shift";
        deleteButton.textContent = "Supprimer";
        actions.append(deleteButton);
      }
      summary.append(identity, actions);
      card.append(summary);

      if (cardModel.showForm) {
        const form = document.createElement("div");
        form.className = "shift-form";

        const codeInput = makeShiftInput("text", "code", shift.code);
        codeInput.maxLength = 4;
        codeInput.pattern = "[A-Za-z0-9]{1,4}";
        const colorInput = makeShiftInput("color", "color", shift.color);
        const startInput = makeShiftInput("time", "startTime", shift.startTime);
        const endInput = makeShiftInput("time", "endTime", shift.endTime);
        const breakStartInput = makeShiftInput("time", "breakStartTime", shift.breakStartTime);
        const breakEndInput = makeShiftInput("time", "breakEndTime", shift.breakEndTime);
        [startInput, endInput, breakStartInput, breakEndInput].forEach((input) => {
          input.disabled = shift.isOff;
        });

        form.append(
          makeShiftField("Nom", makeShiftInput("text", "label", shift.label)),
          makeShiftField("Initiale", codeInput),
          makeShiftField("Couleur", colorInput),
          makeShiftField("Début", startInput),
          makeShiftField("Fin", endInput),
          makeShiftField("Début pause", breakStartInput),
          makeShiftField("Fin pause", breakEndInput),
          makeShiftField("Sans horaire", makeShiftInput("checkbox", "isOff", shift.isOff)),
        );

        card.append(form);
      }
      list.appendChild(card);
    });
  }

  function renderSchedule(simulation) {
    const table = document.getElementById("scheduleTable");
    table.replaceChildren();
    const sizing = getScheduleTableSizing(simulation.weeks.length);
    table.style.setProperty("--schedule-day-count", String(sizing.dayCount));
    table.style.setProperty("--schedule-day-column-width", `${sizing.dayColumnWidth}px`);
    table.style.setProperty("--schedule-series-column-width", `${sizing.seriesColumnWidth}px`);
    table.style.setProperty("--schedule-table-width", `${sizing.tableWidth}px`);

    const colgroup = document.createElement("colgroup");
    const seriesColumn = document.createElement("col");
    seriesColumn.className = "series-col";
    colgroup.appendChild(seriesColumn);
    for (let index = 0; index < sizing.dayCount; index += 1) {
      const dayColumn = document.createElement("col");
      dayColumn.className = "day-col";
      colgroup.appendChild(dayColumn);
    }
    table.appendChild(colgroup);

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const seriesHead = document.createElement("th");
    seriesHead.className = "series-head";
    seriesHead.textContent = "Série";
    headRow.appendChild(seriesHead);
    simulation.weeks.forEach((week, weekIndex) => {
      week.forEach((day) => {
        const th = document.createElement("th");
        th.className = "day-head";
        th.title = formatDateFull(day.date);
        th.innerHTML = `<span>Sem. ${weekIndex + 1}</span><strong>${DAY_NAMES[day.date.getDay()]}</strong>`;
        headRow.appendChild(th);
      });
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    simulation.series.forEach((serie) => {
      const row = document.createElement("tr");
      const serieCell = document.createElement("td");
      serieCell.className = "series-name";
      serieCell.textContent = serie.id;
      row.appendChild(serieCell);
      simulation.weeks.forEach((week) => {
        week.forEach((day) => {
          const assignment = day.assignments[serie.index];
          const workSegments = getCalendarWorkSegments(
            simulation.displayAssignments,
            serie.index,
            day.dayIndex,
          );
          const workedHours = Math.round(
            workSegments.reduce((sum, segment) => sum + segment.hours, 0) * 10,
          ) / 10;
          const cell = document.createElement("td");
          cell.className = "day-cell";
          cell.title = assignment.neutralizedDispo
            ? `${formatDateFull(day.date)} - Dispo neutralisée`
            : formatDateFull(day.date);
          cell.appendChild(makeTag(assignment, workedHours, workSegments, simulation.shiftDefinitions));
          if (assignment.holiday || assignment.neutralizedDispo) {
            const note = document.createElement("span");
            note.className = "cell-note";
            note.textContent = assignment.holiday ? "F" : "WE";
            cell.appendChild(note);
          }
          row.appendChild(cell);
        });
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
  }

  function renderStats(simulation) {
    const table = document.getElementById("statsTable");
    table.replaceChildren();
    table.innerHTML = `
      <thead>
        <tr>
          <th>Série</th>
          <th class="number">Heures de nuit / an</th>
          <th class="number">Week-ends travaillés / an</th>
          <th class="number">Heures WE / an</th>
          <th class="number">Heures WE / mois</th>
        </tr>
      </thead>
      <tbody>
        ${simulation.stats
          .map(
            (row) => `
              <tr>
                <td><strong>${row.seriesId}</strong></td>
                <td class="number">${formatHours(row.nightHoursYear)}</td>
                <td class="number">${row.weekendWorkedYear}</td>
                <td class="number">${formatHours(row.weekendHoursYear)}</td>
                <td class="number">${formatHours(row.weekendHoursMonth)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    `;
  }

  function renderRules(simulation) {
    const list = document.getElementById("rulesList");
    list.replaceChildren();
    Object.values(RULE_CATEGORIES).forEach((category) => {
      const categoryRules = simulation.rules.filter((rule) => rule.category === category.id);
      if (categoryRules.length === 0) {
        return;
      }
      const group = document.createElement("section");
      group.className = "rule-group";
      group.dataset.category = category.id;
      group.innerHTML = `
        <div class="rule-group-heading">
          <div>
            <h3>${category.title}</h3>
            <p>${category.detail}</p>
          </div>
        </div>
      `;
      const grid = document.createElement("div");
      grid.className = "rule-grid";
      categoryRules.forEach((rule) => {
        const card = document.createElement("article");
        card.className = "rule-card";
        card.dataset.status = rule.status;
        card.innerHTML = `
          <div class="rule-topline">
            <h3>${rule.title}</h3>
            <span class="status-pill status-${rule.status}">${getRuleStatusText(rule.status)}</span>
          </div>
          <p>${rule.detail}</p>
        `;
        grid.appendChild(card);
      });
      group.appendChild(grid);
      list.appendChild(group);
    });
  }

  function renderGlobal(simulation) {
    const failures = simulation.rules.filter((rule) => rule.status === "fail").length;
    const warnings = simulation.rules.filter((rule) => rule.status === "warn").length;
    const globalStatus = document.getElementById("globalStatus");
    globalStatus.innerHTML = `<strong>${failures} échec${failures > 1 ? "s" : ""}</strong>${warnings} dérogation${warnings > 1 ? "s" : ""}`;
    document.getElementById("scheduleTitle").textContent = simulation.version.label;
    document.getElementById("scheduleMeta").textContent =
      `${simulation.series.length} séries, ${simulation.weeks.length} semaines`;
    document.getElementById("statsMeta").textContent =
      `${simulation.period.startLabel} - ${simulation.period.endLabel}, ${simulation.period.days} jours`;
    document.getElementById("statsNote").textContent =
      `Calcul annuel exact sur ${simulation.period.days} jours glissants. Pour cette version, cela représente ${simulation.period.completeDisplayCycles} cycle(s) complet(s) de ${simulation.version.weeks} semaines + ${simulation.period.remainingDays} jour(s), ce qui peut créer de petits écarts entre séries.`;
  }

  function render(simulation) {
    renderGlobal(simulation);
    renderSchedule(simulation);
    renderStats(simulation);
    renderRules(simulation);
  }

  function setupDom() {
    const versionSelect = document.getElementById("versionSelect");
    const seriesCountInput = document.getElementById("seriesCountInput");
    const startDate = document.getElementById("startDate");
    const weekendDispoSelect = document.getElementById("weekendDispoSelect");
    const seriesOffsetSelect = document.getElementById("seriesOffsetSelect");
    const cycleInput = document.getElementById("cycleInput");
    const duplicateVersion = document.getElementById("duplicateVersion");
    const renameVersion = document.getElementById("renameVersion");
    const deleteVersion = document.getElementById("deleteVersion");
    const versionNameEditor = document.getElementById("versionNameEditor");
    const versionNameInput = document.getElementById("versionNameInput");
    const saveVersionName = document.getElementById("saveVersionName");
    const cancelVersionName = document.getElementById("cancelVersionName");
    const legendActions = document.getElementById("legendActions");
    const legendList = document.getElementById("legendList");
    const shiftSettingsStatus = document.getElementById("shiftSettingsStatus");
    applyBaseVersionDefinitions(loadBaseVersionDefinitions(globalScope.localStorage));
    let customVersionLibrary = loadCustomVersionLibrary(globalScope.localStorage);
    const promotedCurrentVersion = promoteCurrentCustomVersionLibrary(customVersionLibrary);
    if (promotedCurrentVersion.versionDefinition) {
      applyBaseVersionDefinitions({
        [DEFAULT_VERSION_ID]: promotedCurrentVersion.versionDefinition,
      });
      saveBaseVersionDefinitions(
        { [DEFAULT_VERSION_ID]: promotedCurrentVersion.versionDefinition },
        globalScope.localStorage,
      );
      customVersionLibrary = promotedCurrentVersion.library;
      saveCustomVersionLibrary(customVersionLibrary, globalScope.localStorage);
    }
    let displaySettings = loadDisplaySettings(globalScope.localStorage);
    let shiftDefinitions = getOfficialShiftDefinitions(customVersionLibrary.selectedVersionId);
    let scheduleSettings = createScheduleSettingsForVersion(
      customVersionLibrary.selectedVersionId,
      shiftDefinitions,
    );
    let shiftEditorOpen = false;

    function getCustomVersionById(versionId) {
      return customVersionLibrary.customVersions.find((version) => version.id === versionId) || null;
    }

    function getActiveCustomVersion() {
      return getCustomVersionById(versionSelect.value);
    }

    function getNextCustomVersionName() {
      const existingNames = new Set(customVersionLibrary.customVersions.map((version) => version.name));
      if (!existingNames.has(CUSTOM_VERSION_LABEL)) {
        return CUSTOM_VERSION_LABEL;
      }
      for (let index = 2; index < 100; index += 1) {
        const candidate = `${CUSTOM_VERSION_LABEL} ${index}`;
        if (!existingNames.has(candidate)) {
          return candidate;
        }
      }
      return `${CUSTOM_VERSION_LABEL} ${customVersionLibrary.customVersions.length + 1}`;
    }

    function renderVersionOptions(selectedVersionId = customVersionLibrary.selectedVersionId) {
      versionSelect.replaceChildren();
      Object.values(VERSION_DEFINITIONS).forEach((definition) => {
        const option = document.createElement("option");
        option.value = definition.id;
        option.textContent = definition.label;
        versionSelect.appendChild(option);
      });
      if (customVersionLibrary.customVersions.length > 0) {
        const group = document.createElement("optgroup");
        group.label = "Versions personnalisées";
        customVersionLibrary.customVersions.forEach((version) => {
          const option = document.createElement("option");
          option.value = version.id;
          option.textContent = version.name;
          group.appendChild(option);
        });
        versionSelect.appendChild(group);
      }
      const hasSelectedVersion =
        isOfficialVersionId(selectedVersionId) || Boolean(getCustomVersionById(selectedVersionId));
      versionSelect.value = hasSelectedVersion ? selectedVersionId : getDefaultVersionId();
      const actionState = getVersionActionsViewModel(
        Boolean(getCustomVersionById(versionSelect.value)),
        !versionNameEditor.hidden,
      );
      renameVersion.disabled = !actionState.canRename;
      deleteVersion.disabled = !actionState.canDelete;
      versionNameEditor.hidden = !actionState.renameEditorOpen;
    }

    function persistVersionState() {
      customVersionLibrary.selectedVersionId = versionSelect.value;
      saveCustomVersionLibrary(customVersionLibrary, globalScope.localStorage);
      saveScheduleSettings(scheduleSettings);
      saveDisplaySettings(displaySettings, globalScope.localStorage);
      if (getCustomVersionById(versionSelect.value)) {
        saveShiftDefinitions(shiftDefinitions);
      }
    }

    function updateCustomVersion(version) {
      customVersionLibrary = {
        ...customVersionLibrary,
        customVersions: customVersionLibrary.customVersions.map((customVersion) =>
          customVersion.id === version.id ? version : customVersion,
        ),
      };
    }

    function loadVersionState(versionId = customVersionLibrary.selectedVersionId, shouldPersist = true) {
      const customVersion = getCustomVersionById(versionId);
      if (customVersion) {
        shiftDefinitions = normalizeShiftDefinitions(customVersion.shiftDefinitions);
        scheduleSettings = normalizeScheduleSettings(
          {
            ...customVersion.scheduleSettings,
            versionId: customVersion.id,
            baseVersionId: customVersion.baseVersionId,
            customName: customVersion.name,
          },
          shiftDefinitions,
        );
        customVersionLibrary.selectedVersionId = customVersion.id;
      } else {
        shiftDefinitions = getOfficialShiftDefinitions(versionId);
        scheduleSettings = createScheduleSettingsForVersion(
          isOfficialVersionId(versionId) ? versionId : getDefaultVersionId(),
          shiftDefinitions,
        );
        customVersionLibrary.selectedVersionId = scheduleSettings.versionId;
      }
      renderVersionOptions(customVersionLibrary.selectedVersionId);
      applyScheduleSettingsToControls();
      if (shouldPersist) {
        persistVersionState();
      }
    }

    function createCustomVersionFromCurrent(name = getNextCustomVersionName()) {
      const customVersion = createCustomVersion({
        name,
        scheduleSettings: readScheduleSettingsFromControls(),
        shiftDefinitions,
      });
      customVersionLibrary = {
        selectedVersionId: customVersion.id,
        customVersions: [...customVersionLibrary.customVersions, customVersion],
      };
      scheduleSettings = customVersion.scheduleSettings;
      shiftDefinitions = customVersion.shiftDefinitions;
      renderVersionOptions(customVersion.id);
      applyScheduleSettingsToControls();
      persistVersionState();
      return customVersion;
    }

    function saveActiveCustomVersion() {
      const customVersion = getActiveCustomVersion();
      if (!customVersion) {
        return createCustomVersionFromCurrent();
      }
      const updatedVersion = createCustomVersion({
        id: customVersion.id,
        name: customVersion.name,
        baseVersionId: customVersion.baseVersionId,
        scheduleSettings: {
          ...readScheduleSettingsFromControls(),
          versionId: customVersion.id,
          baseVersionId: customVersion.baseVersionId,
          customName: customVersion.name,
        },
        shiftDefinitions,
      });
      updateCustomVersion(updatedVersion);
      scheduleSettings = updatedVersion.scheduleSettings;
      shiftDefinitions = updatedVersion.shiftDefinitions;
      renderVersionOptions(updatedVersion.id);
      persistVersionState();
      return updatedVersion;
    }

    function setCycleFromVersion() {
      loadVersionState(versionSelect.value);
    }

    function setShiftStatus(message, isError = false) {
      if (!shiftSettingsStatus) {
        return;
      }
      shiftSettingsStatus.textContent = message;
      shiftSettingsStatus.dataset.status = isError ? "error" : "ok";
    }

    function setVersionNameEditorOpen(open) {
      const customVersion = getActiveCustomVersion();
      const actionState = getVersionActionsViewModel(Boolean(customVersion), open);
      versionNameEditor.hidden = !actionState.renameEditorOpen;
      if (!actionState.renameEditorOpen) {
        return;
      }
      versionNameInput.value = customVersion.name;
      versionNameInput.focus();
      versionNameInput.select();
    }

    function commitVersionNameEdit() {
      const customVersion = getActiveCustomVersion();
      if (!customVersion) {
        setVersionNameEditorOpen(false);
        return;
      }
      customVersionLibrary = renameCustomVersion(
        customVersionLibrary,
        customVersion.id,
        versionNameInput.value,
      );
      const renamedVersion = getCustomVersionById(customVersion.id);
      scheduleSettings = {
        ...scheduleSettings,
        customName: renamedVersion.name,
      };
      renderVersionOptions(customVersion.id);
      persistVersionState();
      setVersionNameEditorOpen(false);
      setShiftStatus(`${renamedVersion.name} renommée.`);
      refresh();
    }

    function renderSeriesOffsetOptions(cycleLength, selectedOffset) {
      const max = getSeriesOffsetMax({ length: cycleLength });
      const selectedValue = String(selectedOffset);
      const values = Array.from({ length: max }, (_, index) => String(index + 1));
      seriesOffsetSelect.replaceChildren(
        ...values.map((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = `${value} jour${value === "1" ? "" : "s"}`;
          return option;
        }),
      );
      seriesOffsetSelect.value = values.includes(selectedValue) ? selectedValue : "1";
    }

    function applyScheduleSettingsToControls() {
      versionSelect.value = customVersionLibrary.selectedVersionId;
      seriesCountInput.value = scheduleSettings.seriesCount;
      startDate.value = displaySettings.startDate;
      weekendDispoSelect.value = scheduleSettings.weekendDispoLimit;
      cycleInput.value = scheduleSettings.cycle;
      renderSeriesOffsetOptions(scheduleSettings.cycle.split(" ").filter(Boolean).length, scheduleSettings.seriesOffset);
    }

    function readScheduleSettingsFromControls() {
      return {
        versionId: versionSelect.value,
        baseVersionId: scheduleSettings.baseVersionId,
        seriesCount: seriesCountInput.value,
        weekendDispoLimit: weekendDispoSelect.value,
        seriesOffset: seriesOffsetSelect.value || scheduleSettings.seriesOffset,
        cycle: cycleInput.value,
      };
    }

    function markScheduleCustom() {
      saveActiveCustomVersion();
    }

    function setCycleValidity(parsedCycle) {
      const valid = parsedCycle.valid;
      cycleInput.classList.toggle("is-invalid", !valid);
      cycleInput.setAttribute("aria-invalid", valid ? "false" : "true");
      cycleInput.title = valid
        ? ""
        : parsedCycle.invalidTokens.length > 0
          ? `Code(s) invalide(s) : ${parsedCycle.invalidTokens.join(", ")}`
          : "Cycle vide ou invalide.";
    }

    function refresh(options = {}) {
      const { normalizeCycleInput = true } = options;
      const parsedCycle = parseCycleInput(cycleInput.value, shiftDefinitions);
      setCycleValidity(parsedCycle);
      renderShiftSettings(shiftDefinitions, shiftEditorOpen);
      if (!parsedCycle.valid) {
        return null;
      }
      const simulation = createSimulation(versionSelect.value, {
        startDate: displaySettings.startDate,
        weekendDispoLimit: weekendDispoSelect.value,
        seriesOffset: seriesOffsetSelect.value,
        cycle: parsedCycle.cycle.join(" "),
        shiftDefinitions,
        scheduleSettings,
      });
      if (normalizeCycleInput) {
        cycleInput.value = simulation.cycle.join(" ");
      }
      scheduleSettings = normalizeScheduleSettings(
        {
          ...scheduleSettings,
          versionId: versionSelect.value,
          seriesCount: seriesCountInput.value,
          weekendDispoLimit: weekendDispoSelect.value,
          seriesOffset: seriesOffsetSelect.value || scheduleSettings.seriesOffset,
          cycle: simulation.cycle.join(" "),
        },
        shiftDefinitions,
      );
      const customVersion = getActiveCustomVersion();
      if (customVersion) {
        updateCustomVersion(
          createCustomVersion({
            ...customVersion,
            scheduleSettings,
            shiftDefinitions,
          }),
        );
      }
      seriesCountInput.value = scheduleSettings.seriesCount;
      persistVersionState();
      renderSeriesOffsetOptions(simulation.cycle.length, simulation.seriesOffset);
      render(simulation);
      return simulation;
    }

    function updateShiftDefinition(code, updates) {
      const current = shiftDefinitions[code];
      if (!current) {
        return;
      }
      shiftDefinitions = normalizeShiftDefinitions({
        ...shiftDefinitions,
        [code]: {
          ...current,
          ...updates,
        },
      });
      markScheduleCustom();
      saveShiftDefinitions(shiftDefinitions);
      refresh();
    }

    function getUniqueShiftCode(baseCode = "P") {
      const normalizedBase = normalizeShiftCode(baseCode) || "P";
      if (!shiftDefinitions[normalizedBase]) {
        return normalizedBase;
      }
      for (let index = 2; index < 100; index += 1) {
        const candidate = `${normalizedBase}${index}`.slice(0, 4);
        if (!shiftDefinitions[candidate]) {
          return candidate;
        }
      }
      return `P${Date.now()}`.slice(0, 4).toUpperCase();
    }

    function handleCodeChange(code, nextCodeInput) {
      const nextCode = normalizeShiftCode(nextCodeInput);
      if (!SHIFT_CODE_PATTERN.test(nextCode)) {
        setShiftStatus("Initiale invalide.", true);
        renderShiftSettings(shiftDefinitions, shiftEditorOpen);
        return;
      }
      if (nextCode === code) {
        return;
      }
      if (shiftDefinitions[nextCode]) {
        setShiftStatus(`${nextCode} existe déjà.`, true);
        renderShiftSettings(shiftDefinitions, shiftEditorOpen);
        return;
      }

      const nextDefinitions = { ...shiftDefinitions };
      nextDefinitions[nextCode] = {
        ...nextDefinitions[code],
        code: nextCode,
        shortLabel: nextCode,
        className: nextDefinitions[code].className?.startsWith("tag-")
          ? nextDefinitions[code].className
          : "tag-dynamic",
      };
      delete nextDefinitions[code];
      shiftDefinitions = normalizeShiftDefinitions(nextDefinitions);
      cycleInput.value = replaceCycleCode(cycleInput.value, code, nextCode);
      markScheduleCustom();
      saveShiftDefinitions(shiftDefinitions);
      setShiftStatus(`${code} devient ${nextCode}.`);
      refresh();
    }

    function handleShiftFieldChange(event) {
      const field = event.target.closest("[data-field]");
      const card = event.target.closest(".shift-card");
      if (!field || !card) {
        return;
      }
      const code = card.dataset.code;
      if (field.dataset.field === "code") {
        handleCodeChange(code, field.value);
        return;
      }
      if (field.dataset.field === "label") {
        updateShiftDefinition(code, { label: field.value.trim() || code });
        return;
      }
      if (field.dataset.field === "color") {
        updateShiftDefinition(code, { color: field.value });
        return;
      }
      if (field.dataset.field === "startTime" || field.dataset.field === "endTime") {
        updateShiftDefinition(code, { [field.dataset.field]: field.value || "00:00", isOff: false });
        return;
      }
      if (field.dataset.field === "breakStartTime" || field.dataset.field === "breakEndTime") {
        updateShiftDefinition(code, { [field.dataset.field]: field.value, isOff: false });
        return;
      }
      if (field.dataset.field === "isOff") {
        updateShiftDefinition(code, {
          isOff: field.checked,
          startTime: field.checked ? "" : shiftDefinitions[code].startTime || "08:00",
          endTime: field.checked ? "" : shiftDefinitions[code].endTime || "16:00",
          breakStartTime: field.checked ? "" : shiftDefinitions[code].breakStartTime,
          breakEndTime: field.checked ? "" : shiftDefinitions[code].breakEndTime,
        });
      }
    }

    function handleShiftAction(event) {
      const actionButton = event.target.closest("[data-action]");
      const card = event.target.closest(".shift-card");
      if (!actionButton || !card) {
        return;
      }
      const code = card.dataset.code;
      if (actionButton.dataset.action === "delete-shift") {
        const result = removeShiftDefinition(shiftDefinitions, code, cycleInput.value);
        shiftDefinitions = result.shiftDefinitions;
        setShiftStatus(result.message, !result.removed);
        if (result.removed) {
          markScheduleCustom();
          saveShiftDefinitions(shiftDefinitions);
          refresh();
        } else {
          renderShiftSettings(shiftDefinitions, shiftEditorOpen);
        }
      }
    }

    function addShiftDefinition() {
      const code = getUniqueShiftCode("P");
      shiftDefinitions = normalizeShiftDefinitions({
        ...shiftDefinitions,
        [code]: {
          code,
          label: "Nouvelle pause",
          color: "#7b6f4d",
          startTime: "08:00",
          endTime: "16:00",
          breakStartTime: "",
          breakEndTime: "",
          isOff: false,
        },
      });
      shiftEditorOpen = true;
      markScheduleCustom();
      saveShiftDefinitions(shiftDefinitions);
      setShiftStatus(`${code} ajoutée.`);
      refresh();
    }

    function handleLegendAction(event) {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) {
        return;
      }
      if (actionButton.dataset.action === "open-shift-editor") {
        shiftEditorOpen = true;
        refresh();
      } else if (actionButton.dataset.action === "close-shift-editor") {
        shiftEditorOpen = false;
        refresh();
      } else if (actionButton.dataset.action === "add-shift") {
        addShiftDefinition();
      }
    }

    versionSelect.addEventListener("change", () => {
      setVersionNameEditorOpen(false);
      setCycleFromVersion();
      refresh();
    });
    duplicateVersion.addEventListener("click", () => {
      setVersionNameEditorOpen(false);
      const sourceVersion = getActiveCustomVersion();
      const name = sourceVersion ? `Copie de ${sourceVersion.name}` : getNextCustomVersionName();
      createCustomVersionFromCurrent(name);
      setShiftStatus(`${name} créée.`);
      refresh();
    });
    renameVersion.addEventListener("click", () => {
      setVersionNameEditorOpen(true);
    });
    saveVersionName.addEventListener("click", commitVersionNameEdit);
    cancelVersionName.addEventListener("click", () => {
      setVersionNameEditorOpen(false);
    });
    versionNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitVersionNameEdit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setVersionNameEditorOpen(false);
      }
    });
    deleteVersion.addEventListener("click", () => {
      const customVersion = getActiveCustomVersion();
      if (!customVersion) {
        return;
      }
      const confirmed = globalScope.confirm?.(`Supprimer "${customVersion.name}" ?`);
      if (!confirmed) {
        return;
      }
      setVersionNameEditorOpen(false);
      customVersionLibrary = deleteCustomVersion(customVersionLibrary, customVersion.id);
      loadVersionState(customVersionLibrary.selectedVersionId);
      setShiftStatus(`${customVersion.name} supprimée.`);
      refresh();
    });
    startDate.addEventListener("change", () => {
      displaySettings = normalizeDisplaySettings({ startDate: startDate.value });
      startDate.value = displaySettings.startDate;
      saveDisplaySettings(displaySettings, globalScope.localStorage);
      refresh();
    });
    seriesCountInput.addEventListener("change", () => {
      markScheduleCustom();
      refresh();
    });
    weekendDispoSelect.addEventListener("change", () => {
      markScheduleCustom();
      refresh();
    });
    seriesOffsetSelect.addEventListener("change", () => {
      markScheduleCustom();
      refresh();
    });
    cycleInput.addEventListener("input", () => {
      markScheduleCustom();
      refresh({ normalizeCycleInput: false });
    });
    legendActions.addEventListener("click", handleLegendAction);
    legendList.addEventListener("click", handleShiftAction);
    legendList.addEventListener("change", handleShiftFieldChange);

    loadVersionState(customVersionLibrary.selectedVersionId);
    refresh();
  }

  const api = {
    VERSION_DEFINITIONS,
    SHIFT_DEFINITIONS,
    BASE_VERSION_STORAGE_KEY,
    CUSTOM_VERSION_ID,
    CUSTOM_VERSIONS_STORAGE_KEY,
    DEFAULT_VERSION_ID,
    DISPLAY_SETTINGS_STORAGE_KEY,
    DEFAULT_SHIFT_DEFINITION_LIST,
    SCHEDULE_SETTINGS_STORAGE_KEY,
    SHIFT_SETTINGS_STORAGE_KEY,
    createSimulation,
    createCustomScheduleSettings,
    createCustomVersion,
    createScheduleSettingsForVersion,
    deleteCustomVersion,
    getCalendarWorkSegments,
    getCalendarWorkedHours,
    getWorkedHoursLabel,
    getNightHoursForShift,
    getScheduleTableSizing,
    getShiftSettingsViewModel,
    getWeekendHoursForShift,
    getVersionActionsViewModel,
    loadDisplaySettings,
    loadScheduleSettings,
    loadActiveShiftDefinitionsForSchedule,
    loadCustomVersionLibrary,
    loadShiftDefinitions,
    normalizeShiftCode,
    normalizeScheduleSettings,
    normalizeShiftDefinitions,
    getSeriesOffsetMax,
    getRuleStatusText,
    RULE_CATEGORIES,
    loadBaseVersionDefinitions,
    normalizeCycle,
    parseCycleInput,
    parseSeriesOffset,
    parseSeriesCount,
    parseWeekendDispoLimit,
    promoteCurrentCustomVersionLibrary,
    renameCustomVersion,
    removeShiftDefinition,
    replaceCycleCode,
    saveCustomVersionLibrary,
    saveBaseVersionDefinitions,
    saveDisplaySettings,
    saveScheduleSettings,
    saveShiftDefinitions,
    shiftDefinitionsToList,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.HoraireSimulator = api;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", setupDom);
  }
})(typeof window !== "undefined" ? window : globalThis);
