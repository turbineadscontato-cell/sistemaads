// Normaliza CPF/telefone pra só dígitos, pra poder comparar/gravar de forma
// consistente independente de como a pessoa digitou (com ponto, traço,
// parênteses, espaço etc.).
function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

module.exports = { onlyDigits };
