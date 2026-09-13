// Notificações push (Web Push) — 13/09/2026.
//
// IMPORTANTE (limitação real do navegador, não do nosso código): quando o
// app está fechado/minimizado, o toque que a notificação faz é sempre o som
// padrão do sistema operacional/navegador — nenhum navegador (Chrome,
// Firefox, Safari) permite um arquivo de som customizado numa notificação
// em segundo plano. Um "toque premium" próprio só é possível enquanto o
// app está aberto na tela (ver playPremiumChime no componente
// PushNotifications do frontend, que sintetiza esse som via Web Audio API
// quando a mensagem chega com o app em primeiro plano).
const webpush = require("web-push");
const prisma = require("../prisma");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:turbineadscontato@gmail.com";

let configured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

function isPushConfigured() {
  return configured;
}

function getPublicKey() {
  return VAPID_PUBLIC_KEY;
}

// Manda o push pra uma lista de subscriptions já carregadas do banco. Remove
// sozinho qualquer subscription que o próprio serviço de push já descartou
// (404/410 — típico de desinstalar o app, limpar dados do navegador etc.),
// sem precisar de uma rotina de limpeza separada.
async function sendToSubscriptions(subs, payload) {
  if (!subs.length) return;
  const body = JSON.stringify(payload);
  const deadIds = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) deadIds.push(sub.id);
        else console.error("push falhou:", err.statusCode, err.message);
      }
    })
  );
  if (deadIds.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: deadIds } } }).catch(() => {});
  }
}

async function sendPushToUserIds(userIds, payload) {
  if (!configured || !userIds || !userIds.length) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  await sendToSubscriptions(subs, payload);
}

async function sendPushToRoles(roles, payload) {
  if (!configured) return;
  const users = await prisma.user.findMany({ where: { role: { in: roles }, active: true }, select: { id: true } });
  await sendPushToUserIds(users.map((u) => u.id), payload);
}

// Dedup atômico: tenta criar o log ANTES de mandar o push. Se já existir
// (mesma kind+refId+dateKey), a criação falha na constraint única e a gente
// simplesmente desiste — assim duas rodadas do job nunca mandam o mesmo
// aviso duas vezes, mesmo se rodarem quase ao mesmo tempo.
async function notifyOnce({ kind, refId, dateKey }, send) {
  try {
    await prisma.notificationLog.create({ data: { kind, refId, dateKey } });
  } catch (err) {
    return false; // já foi avisado
  }
  await send();
  return true;
}

module.exports = { isPushConfigured, getPublicKey, sendPushToUserIds, sendPushToRoles, notifyOnce };
