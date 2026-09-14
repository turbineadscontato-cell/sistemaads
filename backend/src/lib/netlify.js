// Publicação de sites na Netlify (14/09/2026) — sem nenhuma integração de
// git: sobe um .zip com o HTML pronto (index.html) direto pra API da
// Netlify, que hospeda e devolve um link público (https://algo.netlify.app).
// Documentação: https://docs.netlify.com/api/get-started/
//
// Token pessoal (NETLIFY_TOKEN) fica só numa variável de ambiente do
// Railway, igual toda outra chave desse sistema — nunca em código nem no
// documento do projeto.
const JSZip = require("jszip");

const API_BASE = "https://api.netlify.com/api/v1";

function isNetlifyConfigured() {
  return !!process.env.NETLIFY_TOKEN;
}

function notConfiguredError() {
  const err = new Error(
    "Publicação ainda não configurada. Peça ao sócio para adicionar a variável NETLIFY_TOKEN nas variáveis de ambiente do backend (Railway)."
  );
  err.notConfigured = true;
  return err;
}

async function netlifyRequest(path, { method = "GET", body, isZip = false } = {}) {
  const token = process.env.NETLIFY_TOKEN;
  if (!token) throw notConfiguredError();

  const headers = { Authorization: `Bearer ${token}` };
  if (isZip) headers["Content-Type"] = "application/zip";
  else if (body !== undefined) headers["Content-Type"] = "application/json";

  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isZip ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = null;
  }

  if (!r.ok) {
    const msg = (data && (data.message || data.error)) || text || `Erro ${r.status} na Netlify.`;
    throw new Error(`Netlify: ${msg}`);
  }
  return data;
}

// Transforma o texto que a pessoa digitou no formato que a Netlify aceita
// como início do subdomínio (só letras minúsculas, número e hífen).
function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos (marcas diacriticas isoladas pelo NFD acima)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Cria um site novo na Netlify usando EXATAMENTE o subdomínio que a pessoa
// escolheu (ex: "dra-ana" vira dra-ana.netlify.app) — pedido explícito da
// sócia (14/09/2026) pra poder escolher o início do link. Um subdomínio da
// Netlify é único entre TODOS os usuários da Netlify no mundo, então, se o
// nome exato já estiver em uso, tenta "nome-2", "nome-3"... antes de
// desistir e deixar a Netlify escolher um nome aleatório.
async function createSite(desiredSubdomain) {
  const base = slugify(desiredSubdomain) || "site";
  const attempts = [base, `${base}-2`, `${base}-3`, `${base}-4`, `${base}-5`];
  for (const slug of attempts) {
    try {
      return await netlifyRequest("/sites", { method: "POST", body: { name: slug } });
    } catch (err) {
      // Nome já em uso ou inválido — tenta o próximo da lista.
    }
  }
  // Todas as variações já estavam em uso — deixa a Netlify escolher um
  // nome aleatório em vez de travar a publicação por causa do nome.
  return await netlifyRequest("/sites", { method: "POST", body: {} });
}

// Sobe um HTML pronto como um site de página única — monta um .zip só com
// index.html em memória (nunca grava nada em disco) e manda pro endpoint de
// deploy direto por .zip da Netlify (sem precisar do fluxo de "digest" de
// arquivo por arquivo, mais complexo — um zip só já bastam pra um site de
// uma página).
async function deploySite(siteId, html) {
  const zip = new JSZip();
  zip.file("index.html", html);
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const deploy = await netlifyRequest(`/sites/${siteId}/deploys`, { method: "POST", body: zipBuffer, isZip: true });
  return deploy;
}

// Publica (cria o site na primeira vez com o subdomínio escolhido, reaproveita
// depois) e devolve o link público em https. `existingSiteId` vem do
// registro salvo — se já existir, publica em cima do mesmo site (mesmo
// link, ignora `subdomain` — não dá pra trocar o subdomínio de um site já
// criado por essa rota simples) em vez de criar outro.
async function publishHtml({ existingSiteId, subdomain, html }) {
  let site = null;
  if (existingSiteId) {
    try {
      site = await netlifyRequest(`/sites/${existingSiteId}`);
    } catch (err) {
      site = null; // site pode ter sido apagado direto na Netlify — cria de novo
    }
  }
  if (!site) site = await createSite(subdomain);

  await deploySite(site.id, html);
  return { siteId: site.id, url: site.ssl_url || site.url, name: site.name };
}

module.exports = { isNetlifyConfigured, publishHtml, slugify };
