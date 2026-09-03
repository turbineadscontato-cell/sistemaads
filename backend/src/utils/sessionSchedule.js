// Computes the full calendar of a patient's contracted session package.
//
// Sessions/week is intentionally NOT a separate field — it's just how many
// weekdays are marked on the patient (`weekdays`, already used to drive the
// weekly agenda board). Ex: patient contracted 4 sessions, 1 weekday marked
// (segunda) => 4 mondays in a row. 2 weekdays marked => 2 sessions/week, so
// the 4 sessions land across 2 weeks. This keeps the "days he attends" and
// "how often he attends" as a single source of truth instead of two fields
// that could disagree with each other.
//
// Walks forward day-by-day from packageStartDate (or the patient's createdAt
// if that wasn't set) picking dates that fall on one of the marked weekdays,
// until it has `packageTotalSessions` of them.
function computeSessionSchedule(patient) {
  const total = patient.packageTotalSessions;
  const weekdays = patient.weekdays || [];
  if (!total || total <= 0 || weekdays.length === 0) return null;

  const start = patient.packageStartDate || patient.createdAt;
  if (!start) return null;

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  let hours = null;
  let minutes = 0;
  if (patient.sessionTime && /^\d{1,2}:\d{2}$/.test(patient.sessionTime)) {
    const [h, m] = patient.sessionTime.split(":").map(Number);
    hours = h;
    minutes = m;
  }

  const marked = new Set(weekdays);
  const dates = [];
  let guard = 0;
  // 3650 days (~10 years) is far more than enough headroom for any real
  // package while still guaranteeing the loop terminates.
  while (dates.length < total && guard < 3650) {
    if (marked.has(cursor.getDay())) {
      const d = new Date(cursor);
      if (hours != null) d.setHours(hours, minutes, 0, 0);
      dates.push(d.toISOString());
    }
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }

  const now = new Date();
  const completed = dates.filter((d) => new Date(d) < now).length;

  return {
    total,
    sessionsPerWeek: weekdays.length,
    startDate: start,
    dates,
    completed,
    remaining: total - completed,
  };
}

module.exports = { computeSessionSchedule };
