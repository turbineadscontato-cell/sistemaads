// Helpers for the "dia de otimização" weekly-cadence tracking on Client
// (nextOptimizationDate / lastOptimizedAt). Deliberately UTC-only — see
// sessionSchedule.js for why: dates picked from a weekday selector or a
// plain "YYYY-MM-DD" must stay on the calendar date they represent no
// matter the server's local timezone, or "toda segunda" can silently
// compute to "toda domingo" a few hours off UTC.

// Next date on/after `from` that falls on `weekday` (0=domingo … 6=sábado).
// If `from` itself is already that weekday, returns `from` (at UTC midnight)
// — i.e. inclusive, not "strictly after".
function nextOccurrence(weekday, from) {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  if (weekday == null) return d;
  const diff = (Number(weekday) - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

// Called when the professional/gestor marks this week's otimização as done.
// Advances from whichever date was actually due (not from "hoje"), so the
// weekly cadence stays anchored to the chosen weekday even if it gets marked
// a day or two late — never drifts forward.
function advanceAfterOptimizing(client) {
  const base = client.nextOptimizationDate
    ? new Date(client.nextOptimizationDate)
    : nextOccurrence(client.optimizationDay, new Date());
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + 7);
  return base;
}

module.exports = { nextOccurrence, advanceAfterOptimizing };
