const dayjs = require('dayjs');
const duration = require('dayjs/plugin/duration');
dayjs.extend(duration);

function calculateWorkedHours(entries) {
  let totalMinutes = 0;
  let clockIn = null;
  let breakStart = null;
  let breakMinutes = 0;

  const sorted = [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  for (const entry of sorted) {
    switch (entry.type) {
      case 'CLOCK_IN':
        clockIn = dayjs(entry.timestamp);
        break;
      case 'BREAK_START':
        breakStart = dayjs(entry.timestamp);
        break;
      case 'BREAK_END':
        if (breakStart) {
          breakMinutes += dayjs(entry.timestamp).diff(breakStart, 'minute');
          breakStart = null;
        }
        break;
      case 'CLOCK_OUT':
        if (clockIn) {
          const worked = dayjs(entry.timestamp).diff(clockIn, 'minute');
          totalMinutes += worked - breakMinutes;
          clockIn = null;
          breakMinutes = 0;
        }
        break;
    }
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    totalMinutes,
    formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    hours,
    minutes
  };
}

function calculateOvertime(workedMinutes, workloadHours) {
  const expectedMinutes = workloadHours * 60;
  const overtimeMinutes = Math.max(0, workedMinutes - expectedMinutes);
  const deficitMinutes = Math.max(0, expectedMinutes - workedMinutes);

  return {
    overtimeMinutes,
    deficitMinutes,
    overtimeFormatted: `${String(Math.floor(overtimeMinutes / 60)).padStart(2, '0')}:${String(overtimeMinutes % 60).padStart(2, '0')}`,
    deficitFormatted: `${String(Math.floor(deficitMinutes / 60)).padStart(2, '0')}:${String(deficitMinutes % 60).padStart(2, '0')}`
  };
}

module.exports = { calculateWorkedHours, calculateOvertime };
