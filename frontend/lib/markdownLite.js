// Renderizador de markdown bem enxuto, sem nenhuma dependência nova — só o
// suficiente pra deixar as respostas da IA legíveis numa bolha de chat
// (negrito, listas, títulos curtos, código inline, parágrafos). Evita
// adicionar uma lib como react-markdown só pra isso, o que exigiria manter
// mais uma dependência sincronizada em todo upload manual — não vale a
// pena pra algo tão pontual.
import { createElement as h } from "react";

// Negrito **texto**, itálico *texto*/_texto_, código `texto` — aplicado
// dentro de uma linha só, sem aninhar (suficiente pro estilo de resposta
// que os prompts da IA já pedem: "**Título**", listas com hífen, etc.).
function renderInline(text, keyPrefix) {
  const parts = [];
  const regex = /(\*\*.+?\*\*|`.+?`|\*.+?\*|_.+?_)/g;
  let lastIndex = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) {
      parts.push(h("strong", { key }, token.slice(2, -2)));
    } else if (token.startsWith("`")) {
      parts.push(h("code", { key, className: "px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 mono text-[0.9em]" }, token.slice(1, -1)));
    } else {
      parts.push(h("em", { key }, token.slice(1, -1)));
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

// Uma linha inteira só em negrito (ex: "**Diagnóstico geral**") — o jeito
// que os prompts da IA pedem pra marcar seções, em vez de "# Título". Vem
// quase sempre colada na lista/parágrafo seguinte, sem linha em branco no
// meio — por isso é tratada à parte de bloco/heading "#".
function boldHeadingLine(line) {
  const m = line.trim().match(/^\*\*(.+?)\*\*:?\s*$/);
  return m ? m[1] : null;
}

function renderLines(lines, bi) {
  const isBullets = lines.every((l) => /^[-*]\s+/.test(l.trim()));
  if (isBullets) {
    return h(
      "ul",
      { key: `${bi}-ul`, className: "list-disc pl-4 space-y-0.5" },
      lines.map((l, li) => h("li", { key: li }, renderInline(l.trim().replace(/^[-*]\s+/, ""), `${bi}-${li}`)))
    );
  }

  const isNumbered = lines.every((l) => /^\d+[.)]\s+/.test(l.trim()));
  if (isNumbered) {
    return h(
      "ol",
      { key: `${bi}-ol`, className: "list-decimal pl-4 space-y-0.5" },
      lines.map((l, li) => h("li", { key: li }, renderInline(l.trim().replace(/^\d+[.)]\s+/, ""), `${bi}-${li}`)))
    );
  }

  return h(
    "p",
    { key: `${bi}-p` },
    lines.flatMap((l, li) => {
      const rendered = renderInline(l, `${bi}-${li}`);
      return li === 0 ? rendered : [h("br", { key: `${bi}-br-${li}` }), ...rendered];
    })
  );
}

// Quebra em blocos por linha em branco, detecta um "**Título**" solto na
// primeira linha (renderizado à parte, o resto do bloco continua sendo
// processado como lista/parágrafo normalmente), listas (- / * / 1.),
// títulos "#"/"##"/"###" e trata o resto como parágrafo — cada linha
// dentro de um parágrafo vira uma quebra (<br/>), preservando quebras que
// a IA já usa pra separar ideias sem forçar tudo num bloco só.
export function renderMarkdownLite(text) {
  if (!text) return null;
  const blocks = String(text).replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) return null;

    if (lines.length === 1) {
      const headingMatch = lines[0].match(/^(#{1,3})\s+(.*)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const cls = level === 1 ? "font-display font-semibold text-[13.5px]" : "font-display font-semibold text-[12.5px]";
        return h("div", { key: bi, className: `${cls} mt-1` }, renderInline(headingMatch[2], `${bi}-h`));
      }
    }

    // Primeira linha é um "**Título**" sozinho e há mais conteúdo depois —
    // separa como um sub-título e processa o resto (lista/parágrafo) à parte.
    const heading = lines.length > 1 ? boldHeadingLine(lines[0]) : null;
    if (heading) {
      return h(
        "div",
        { key: bi, className: "space-y-1" },
        h("div", { className: "font-display font-semibold text-[12.5px] mt-1" }, heading),
        renderLines(lines.slice(1), bi)
      );
    }

    return renderLines(lines, bi);
  }).filter(Boolean);
}
