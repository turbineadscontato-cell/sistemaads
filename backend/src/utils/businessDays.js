// Adds N business days (dias úteis — segunda a sexta, sem contar sábado e
// domingo) to a date. Used for the auto-created onboarding tasks' prazos
// (ex: "2 dias úteis" a partir da data de contratação do cliente).
//
// Convention: exclusive counting — the start date itself doesn't count as
// day 1, we walk forward N business days from it (so "1 dia útil" a partir
// de uma sexta-feira cai na segunda seguinte, pulando o fim de semana). UTC
// throughout, same reasoning as sessionSchedule.js / optimizationSchedule.js.
function addBusinessDays(start, n) {
  const d = new Date(start);
  d.setUTCHours(0, 0, 0, 0);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d;
}

module.exports = { addBusinessDays };
