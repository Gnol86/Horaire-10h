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
    v7: {
      id: "v7",
      label: "7 semaines / 7 séries",
      weeks: 7,
      seriesCount: 7,
      cycle: ["M", "A", "N", "DN", "R", "R", "D"],
    },
    v8: {
      id: "v8",
      label: "8 semaines / 8 séries",
      weeks: 8,
      seriesCount: 8,
      cycle: ["M", "A", "N", "DN", "R", "R", "D", "D"],
    },
  };

  const SHIFT_DEFINITIONS = {
    M: {
      label: "Matin",
      shortLabel: "M",
      startHour: 6.5,
      endHour: 16.5,
      hours: 10,
      className: "tag-m",
    },
    A: {
      label: "Après-midi",
      shortLabel: "A",
      startHour: 12,
      endHour: 22,
      hours: 10,
      className: "tag-a",
    },
    N: {
      label: "Nuit",
      shortLabel: "N",
      startHour: 21,
      endHour: 31,
      hours: 10,
      className: "tag-n",
    },
    DN: {
      label: "Descente de nuit",
      shortLabel: "DN",
      hours: 0,
      className: "tag-dn",
    },
    R: {
      label: "Repos",
      shortLabel: "R",
      hours: 0,
      className: "tag-r",
    },
    D: {
      label: "Dispo",
      shortLabel: "D",
      startHour: 8,
      endHour: 16.1,
      hours: 7.6,
      className: "tag-d",
    },
  };

  const VALID_CODES = new Set(Object.keys(SHIFT_DEFINITIONS));
  const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

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

  function getWorkedHoursLabel(assignment, workedHours = null) {
    const shift = SHIFT_DEFINITIONS[assignment.code] || SHIFT_DEFINITIONS.R;
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

  function parseCycleInput(input) {
    const tokens = String(input || "")
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
    const invalidTokens = tokens.filter((token) => !VALID_CODES.has(token));
    return {
      valid: tokens.length > 0 && invalidTokens.length === 0,
      cycle: tokens.filter((token) => VALID_CODES.has(token)),
      invalidTokens,
    };
  }

  function normalizeCycle(input, fallbackCycle) {
    const parsed = parseCycleInput(input);
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
  ) {
    const plannedCode = getPlannedCode(cycle, seriesIndex, dayIndex, seriesOffset);
    const code = neutralizedDispo ? "R" : plannedCode;
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

  function makeDayAssignments(cycle, series, dayIndex, date, holidaySet, weekendDispoLimit, seriesOffset) {
    const holiday = isHoliday(date, holidaySet);
    const weekend = isWeekend(date);
    let keptWeekendDispos = 0;

    return series.map((serie) => {
      const plannedCode = getPlannedCode(cycle, serie.index, dayIndex, seriesOffset);
      let neutralizedDispo = false;

      if (plannedCode === "D") {
        if (holiday) {
          neutralizedDispo = true;
        } else if (weekend) {
          neutralizedDispo = keptWeekendDispos >= weekendDispoLimit;
          if (!neutralizedDispo) {
            keptWeekendDispos += 1;
          }
        }
      }

      return makeDayAssignment(cycle, serie.index, dayIndex, date, holidaySet, neutralizedDispo, seriesOffset);
    });
  }

  function buildAssignments(definition, startDate, cycle, days, weekendDispoLimit = 0, seriesOffset = 1) {
    const holidaySet = buildHolidaySet(startDate.getFullYear());
    const series = Array.from({ length: definition.seriesCount }, (_, index) => ({
      id: `S${pad(index + 1)}`,
      index,
    }));
    const parsedWeekendDispoLimit = parseWeekendDispoLimit(weekendDispoLimit);
    const parsedSeriesOffset = parseSeriesOffset(seriesOffset, cycle);
    return {
      holidaySet,
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
          ),
        };
      }),
    };
  }

  function makeShiftEvent(assignment) {
    const shift = SHIFT_DEFINITIONS[assignment.code];
    if (!shift || shift.startHour == null || assignment.neutralizedDispo) {
      return null;
    }
    const start = atHour(assignment.date, shift.startHour);
    const end = atHour(assignment.date, shift.endHour);
    return {
      seriesIndex: assignment.seriesIndex,
      code: assignment.code,
      plannedCode: assignment.plannedCode,
      start,
      end,
      dayIndex: assignment.dayIndex,
      hours: (end.getTime() - start.getTime()) / HOUR,
      nightHours: getNightHoursForShift(start, end),
      weekendHours: getWeekendHoursForShift(start, end),
    };
  }

  function getNightHoursForShift(start, end) {
    let cursorDay = addDays(start, -1);
    let nightHours = 0;
    while (cursorDay < end) {
      const nightStart = atHour(cursorDay, 22);
      const nightEnd = atHour(cursorDay, 30);
      nightHours += getOverlapHours(nightStart.getTime(), nightEnd.getTime(), { start, end });
      cursorDay = addDays(cursorDay, 1);
    }
    return Math.round(nightHours * 10) / 10;
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
      const event = makeShiftEvent(assignment);
      if (!event) {
        return;
      }
      const hours = getOverlapHours(startMs, endMs, event);
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

  function buildEvents(assignments, seriesCount) {
    const eventsBySeries = Array.from({ length: seriesCount }, () => []);
    assignments.days.forEach((day) => {
      day.assignments.forEach((assignment) => {
        const event = makeShiftEvent(assignment);
        if (event) {
          eventsBySeries[assignment.seriesIndex].push(event);
        }
      });
    });
    return eventsBySeries;
  }

  function getWeekendHoursForShift(start, end) {
    let cursor = new Date(start);
    const stop = new Date(end);
    let weekendHours = 0;
    while (cursor < stop) {
      const nextMidnight = new Date(cursor);
      nextMidnight.setHours(24, 0, 0, 0);
      const segmentEnd = nextMidnight < stop ? nextMidnight : stop;
      if (isWeekend(cursor)) {
        weekendHours += (segmentEnd.getTime() - cursor.getTime()) / HOUR;
      }
      cursor = segmentEnd;
    }
    return Math.round(weekendHours * 10) / 10;
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
      const total = events.reduce((sum, event) => sum + getOverlapHours(anchor, end, event), 0);
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

  function isWorkedAssignment(assignment) {
    return SHIFT_DEFINITIONS[assignment.code].startHour != null;
  }

  function analyzeConsecutiveWorkRest(assignments) {
    const summary = {
      maxConsecutiveWorkDays: 0,
      twoRestViolations: [],
      singleRestViolations: [],
    };

    assignments.series.forEach((serie) => {
      let dayIndex = 0;
      while (dayIndex < assignments.days.length) {
        const assignment = assignments.days[dayIndex].assignments[serie.index];
        if (!isWorkedAssignment(assignment)) {
          dayIndex += 1;
          continue;
        }

        const runStartIndex = dayIndex;
        while (
          dayIndex < assignments.days.length &&
          isWorkedAssignment(assignments.days[dayIndex].assignments[serie.index])
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
          !isWorkedAssignment(assignments.days[restIndex].assignments[serie.index]) &&
          restCount < 2
        ) {
          restCount += 1;
          restIndex += 1;
        }

        const resumesAfterRest =
          restIndex < assignments.days.length &&
          isWorkedAssignment(assignments.days[restIndex].assignments[serie.index]);

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

  function makeStats(assignments, eventsBySeries, horizonDays) {
    const weeks = horizonDays / 7;
    return assignments.series.map((serie) => {
      const events = eventsBySeries[serie.index];
      const totalHours = events.reduce((sum, event) => sum + event.hours, 0);
      const nightCount = events.filter((event) => event.code === "N").length;
      const nightHoursYear = events.reduce((sum, event) => sum + event.nightHours, 0);
      const weekendWorkedYear = countWeekendWork(events);
      const weekendHoursYear = events.reduce((sum, event) => sum + event.weekendHours, 0);
      const max24Hours = getMaxRollingHours(events, 24);
      const max168Hours = getMaxRollingHours(events, 168);
      const maxConsecutiveWorkDays = countMaxConsecutiveDays(
        assignments,
        serie.index,
        isWorkedAssignment,
      );
      const maxConsecutiveNights = countMaxConsecutiveDays(
        assignments,
        serie.index,
        (assignment) => assignment.code === "N",
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

  function checkNightFollowedByDn(assignments) {
    const violations = [];
    assignments.series.forEach((serie) => {
      for (let dayIndex = 0; dayIndex < assignments.days.length - 1; dayIndex += 1) {
        const current = assignments.days[dayIndex].assignments[serie.index];
        const next = assignments.days[dayIndex + 1].assignments[serie.index];
        if (current.code === "N" && next.code !== "N" && next.plannedCode !== "DN") {
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

  function countWeekdayDispoIssues(assignments) {
    return assignments.days.filter((day) => {
      if (!isWorkingDay(day.date, assignments.holidaySet)) {
        return false;
      }
      const dispoCount = day.assignments.filter((assignment) => assignment.code === "D").length;
      return dispoCount < 2;
    });
  }

  function countDailyCoverageIssues(assignments, code) {
    return assignments.days
      .map((day) => ({
        date: day.date,
        count: day.assignments.filter((assignment) => assignment.code === code).length,
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

  function getNonWorkingDispoSummary(assignments, weekendDispoLimit) {
    return assignments.days.reduce(
      (summary, day) => {
        const dayWeekendDispos = day.assignments.filter(
          (assignment) => assignment.weekend && assignment.plannedCode === "D" && assignment.code === "D",
        ).length;
        const holidayDispos = day.assignments.filter(
          (assignment) => assignment.holiday && assignment.plannedCode === "D" && assignment.code === "D",
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

  function buildRules(assignments, stats, eventsBySeries, weekendDispoLimit) {
    const rules = [];
    const maxAverage = getWorst(stats, "averageWeeklyHours");
    const max24 = getWorst(stats, "max24Hours");
    const max168 = getWorst(stats, "max168Hours");
    const consecutiveWorkRest = analyzeConsecutiveWorkRest(assignments);
    const maxConsecutiveNights = getWorst(stats, "maxConsecutiveNights");
    const maxWeekendWorked = getWorst(stats, "weekendWorkedYear");
    const maxNights = getWorst(stats, "nightCount");
    const maxNightHours = getWorst(stats, "nightHoursYear");
    const nightDnViolations = checkNightFollowedByDn(assignments);
    const morningAfterDn = checkTransition(
      assignments,
      (previous, current) => previous.plannedCode === "DN" && current.code === "M",
    );
    const dispoAfterMultiNightDn = checkTransition(assignments, (previous, current, beforePrevious) => {
      return (
        previous.plannedCode === "DN" &&
        beforePrevious &&
        beforePrevious.code === "N" &&
        current.code === "D"
      );
    });
    const weekdayDispoIssues = countWeekdayDispoIssues(assignments);
    const morningCoverageIssues = countDailyCoverageIssues(assignments, "M");
    const afternoonCoverageIssues = countDailyCoverageIssues(assignments, "A");
    const nightCoverageIssues = countDailyCoverageIssues(assignments, "N");
    const nonWorkingDispoSummary = getNonWorkingDispoSummary(assignments, weekendDispoLimit);

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
    const definition = VERSION_DEFINITIONS[versionId] || VERSION_DEFINITIONS.v7;
    const startDate = parseDateInput(options.startDate || "2026-01-05");
    const cycle = normalizeCycle(options.cycle || definition.cycle.join(" "), definition.cycle);
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
    );
    const annualAssignments = buildAssignments(
      definition,
      startDate,
      cycle,
      yearDays,
      weekendDispoLimit,
      seriesOffset,
    );
    const annualEvents = buildEvents(annualAssignments, definition.seriesCount);
    const stats = makeStats(annualAssignments, annualEvents, yearDays);
    const rules = buildRules(annualAssignments, stats, annualEvents, weekendDispoLimit);
    const periodEnd = addDays(startDate, yearDays - 1);
    const completeDisplayCycles = Math.floor(yearDays / displayDays);
    return {
      version: definition,
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

  function getWorkedHoursSourceLabel(assignment, workSegments = []) {
    if (assignment.neutralizedDispo) {
      return "Dispo neutralisée";
    }
    if (workSegments.length === 0) {
      return SHIFT_DEFINITIONS[assignment.code].label;
    }
    const labels = workSegments.map((segment) => {
      if (segment.code === "N" && segment.sourceDayIndex < assignment.dayIndex) {
        return "Nuit précédente";
      }
      return SHIFT_DEFINITIONS[segment.code]?.label || SHIFT_DEFINITIONS[assignment.code].label;
    });
    return [...new Set(labels)].join(" + ");
  }

  function makeTag(assignment, workedHours = null, workSegments = []) {
    const shift = SHIFT_DEFINITIONS[assignment.code];
    const sourceLabel = getWorkedHoursSourceLabel(assignment, workSegments);
    const tag = document.createElement("b");
    tag.className = `tag ${shift.className}${assignment.neutralizedDispo ? " tag-neutralized" : ""}`;
    tag.textContent = assignment.neutralizedDispo ? "R*" : shift.shortLabel;
    tag.dataset.hours = getWorkedHoursLabel(assignment, workedHours);
    tag.dataset.source = sourceLabel;
    tag.tabIndex = 0;
    tag.title = assignment.neutralizedDispo
      ? `Dispo neutralisée en repos effectif - ${tag.dataset.hours}`
      : `${sourceLabel} - ${tag.dataset.hours}`;
    tag.setAttribute("aria-label", tag.title);
    return tag;
  }

  function renderSchedule(simulation) {
    const table = document.getElementById("scheduleTable");
    table.replaceChildren();

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
          cell.appendChild(makeTag(assignment, workedHours, workSegments));
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
    const startDate = document.getElementById("startDate");
    const weekendDispoSelect = document.getElementById("weekendDispoSelect");
    const seriesOffsetSelect = document.getElementById("seriesOffsetSelect");
    const cycleInput = document.getElementById("cycleInput");
    const resetCycle = document.getElementById("resetCycle");

    function setCycleFromVersion() {
      const definition = VERSION_DEFINITIONS[versionSelect.value] || VERSION_DEFINITIONS.v7;
      cycleInput.value = definition.cycle.join(" ");
    }

    function renderSeriesOffsetOptions(cycleLength, selectedOffset) {
      const max = getSeriesOffsetMax({ length: cycleLength });
      const selectedValue = String(selectedOffset);
      const values = Array.from({ length: max }, (_, index) => String(index + 1));
      seriesOffsetSelect.replaceChildren(
        ...values.map((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = `${value} position${value === "1" ? "" : "s"}`;
          return option;
        }),
      );
      seriesOffsetSelect.value = values.includes(selectedValue) ? selectedValue : "1";
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
      const parsedCycle = parseCycleInput(cycleInput.value);
      setCycleValidity(parsedCycle);
      if (!parsedCycle.valid) {
        return null;
      }
      const simulation = createSimulation(versionSelect.value, {
        startDate: startDate.value,
        weekendDispoLimit: weekendDispoSelect.value,
        seriesOffset: seriesOffsetSelect.value,
        cycle: parsedCycle.cycle.join(" "),
      });
      if (normalizeCycleInput) {
        cycleInput.value = simulation.cycle.join(" ");
      }
      renderSeriesOffsetOptions(simulation.cycle.length, simulation.seriesOffset);
      render(simulation);
      return simulation;
    }

    versionSelect.addEventListener("change", () => {
      setCycleFromVersion();
      refresh();
    });
    startDate.addEventListener("change", refresh);
    weekendDispoSelect.addEventListener("change", refresh);
    seriesOffsetSelect.addEventListener("change", refresh);
    cycleInput.addEventListener("input", () => refresh({ normalizeCycleInput: false }));
    resetCycle.addEventListener("click", () => {
      setCycleFromVersion();
      refresh();
    });

    setCycleFromVersion();
    refresh();
  }

  const api = {
    VERSION_DEFINITIONS,
    SHIFT_DEFINITIONS,
    createSimulation,
    getCalendarWorkSegments,
    getCalendarWorkedHours,
    getWorkedHoursLabel,
    getNightHoursForShift,
    getWeekendHoursForShift,
    getSeriesOffsetMax,
    getRuleStatusText,
    RULE_CATEGORIES,
    normalizeCycle,
    parseCycleInput,
    parseSeriesOffset,
    parseWeekendDispoLimit,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.HoraireSimulator = api;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", setupDom);
  }
})(typeof window !== "undefined" ? window : globalThis);
