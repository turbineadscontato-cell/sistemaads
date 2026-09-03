// "Dia de otimização" é um dia fixo da semana (ex: "toda segunda"), não mais
// um número de dia do mês — mais fácil de lembrar e mais coerente com a
// rotina real da agência (otimizações acontecem toda semana, no mesmo dia).
// O valor salvo segue a convenção do JS Date.getDay(): 0 = domingo … 6 = sábado.

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const SHORT_LABEL = {
  0: "domingo",
  1: "segunda",
  2: "terça",
  3: "quarta",
  4: "quinta",
  5: "sexta",
  6: "sábado",
};

// "Toda segunda" / "Toda terça" / "Todo domingo" / "Todo sábado" — com a
// concordância certa em português.
export function weekdayPhrase(day) {
  if (day === null || day === undefined || day === "") return "—";
  const n = Number(day);
  const name = SHORT_LABEL[n];
  if (!name) return "—";
  const article = n === 0 || n === 6 ? "Todo" : "Toda";
  return `${article} ${name}`;
}
