const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { isPushConfigured, getPublicKey, sendPushToUserIds } = require("../lib/push");

const router = express.Router();
router.use(requireAuth);

// Chave pública VAPID que o navegador precisa pra criar a inscrição de push
// (PushManager.subscribe). `configured` diz pro frontend se o servidor já
// tem as chaves (variáveis de ambiente) — sem isso, não adianta nem mostrar
// o botão de ativar.
router.get("/public-key", (req, res) => {
  res.json({ publicKey: getPublicKey(), configured: isPushConfigured() });
});

router.post("/subscribe", async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Inscrição de notificação inválida." });
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth },
    create: { endpoint, userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth },
  });
  res.status(201).json({ ok: true });
});

router.post("/unsubscribe", async (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  res.json({ ok: true });
});

// Deixa o próprio usuário testar se as notificações estão chegando de fato
// (aparece um botão "Testar" na sininho depois de ativar).
router.post("/test", async (req, res) => {
  if (!isPushConfigured()) return res.status(400).json({ error: "Notificações push ainda não configuradas no servidor." });
  await sendPushToUserIds([req.user.id], {
    title: "TurbinaADS",
    body: "Notificações ativadas com sucesso! 🎉",
    tag: "teste",
    url: "/",
  });
  res.json({ ok: true });
});

module.exports = router;
