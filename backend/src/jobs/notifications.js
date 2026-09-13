// Job periódico de notificações push (13/09/2026).
//
// Roda a cada 10 minutos dentro do próprio processo do backend (setInterval
// — não precisa de nenhum serviço externo de agendamento). Cobre os avisos
// que não nascem de uma ação pontual do usuário (diferente de "cliente
// adicionado", que dispara na hora — ver notifyClientCreated, chamado direto
// da rota de criar cliente):
//   - pagamento de cliente vencendo em até 3 dias / atrasado → equipe interna
//     (sócio/gestor/atendente) e o próprio cliente, no portal dele.
//   - reunião em menos de 30 minutos → equipe interna.
//   - sessão de paciente hoje/amanhã, e pagamento do paciente vencendo ou
//     atrasado → o próprio paciente, no portal dele.
//
// Tudo em UTC (mesma convenção do resto do sistema — ver sessionSchedule.js)
// pra data nunca "pular" um dia dependendo do fuso do servidor.
const prisma = require("../prisma");
const { computeSessionSchedule } = require("../utils/sessionSchedule");
const { isPushConfigured, sendPushToRoles, sendPushToUserIds, notifyOnce } = require("../lib/push");

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERNAL_ROLES = ["SOCIO", "GESTOR", "ATENDENTE"];

function utcMidnight(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function dateKeyOf(d) {
  return utcMidnight(d).toISOString().slice(0, 10); // "YYYY-MM-DD"
}
function todayKey() {
  return dateKeyOf(new Date());
}
function daysUntil(date) {
  return Math.round((utcMidnight(date).getTime() - utcMidnight(new Date()).getTime()) / DAY_MS);
}
function brl(n) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Chamada direto da rota POST /api/clients assim que um cliente novo é
// criado — não precisa esperar o job periódico pra esse aviso.
async function notifyClientCreated(client) {
  if (!isPushConfigured()) return;
  await sendPushToRoles(INTERNAL_ROLES, {
    title: "Novo cliente cadastrado",
    body: `${client.name} foi adicionado ao sistema.`,
    tag: `client-${client.id}`,
    url: "/dashboard",
  });
}

async function notifyClientPortalUsers(clientId, { kind, refId, dateKey, title, body }) {
  await notifyOnce({ kind, refId, dateKey }, async () => {
    const users = await prisma.user.findMany({ where: { role: "CLIENTE", clientId }, select: { id: true } });
    if (users.length) await sendPushToUserIds(users.map((u) => u.id), { title, body, tag: refId, url: "/portal" });
  });
}

async function checkClientPayments() {
  const payments = await prisma.payment.findMany({
    where: { status: "PENDENTE" },
    include: { client: { select: { id: true, name: true } } },
  });
  const key = todayKey();
  for (const p of payments) {
    if (!p.client) continue;
    const diff = daysUntil(p.dueDate);
    if (diff < 0) {
      await notifyOnce({ kind: "payment_overdue", refId: p.id, dateKey: key }, () =>
        sendPushToRoles(INTERNAL_ROLES, {
          title: "Pagamento atrasado",
          body: `${p.client.name} está com um pagamento de ${brl(p.amount)} atrasado.`,
          tag: `payment-${p.id}`,
          url: "/dashboard",
        })
      );
      await notifyClientPortalUsers(p.clientId, {
        kind: "client_payment_overdue",
        refId: p.id,
        dateKey: key,
        title: "Pagamento em atraso",
        body: `Seu pagamento de ${brl(p.amount)} está em atraso. Regularize o quanto antes.`,
      });
    } else if (diff <= 3) {
      const quando = diff === 0 ? "hoje" : `em ${diff} dia${diff > 1 ? "s" : ""}`;
      await notifyOnce({ kind: "payment_due_soon", refId: p.id, dateKey: key }, () =>
        sendPushToRoles(INTERNAL_ROLES, {
          title: "Pagamento vencendo",
          body: `${p.client.name} tem um pagamento de ${brl(p.amount)} vencendo ${quando}.`,
          tag: `payment-${p.id}`,
          url: "/dashboard",
        })
      );
      await notifyClientPortalUsers(p.clientId, {
        kind: "client_payment_due_soon",
        refId: p.id,
        dateKey: key,
        title: "Pagamento próximo do vencimento",
        body: `Seu pagamento de ${brl(p.amount)} vence ${quando}.`,
      });
    }
  }
}

async function checkMeetingsSoon() {
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 60 * 1000);
  const meetings = await prisma.meeting.findMany({
    where: { scheduledAt: { gte: now, lte: soon }, status: { in: ["agendada", "confirmada"] } },
    include: { client: { select: { name: true } }, lead: { select: { name: true } } },
  });
  for (const m of meetings) {
    const who = m.client?.name || m.lead?.name || "um contato";
    // dateKey "once" (não é recorrente por dia) — uma reunião específica só
    // dispara esse aviso uma única vez, nunca de novo.
    await notifyOnce({ kind: "meeting_soon", refId: m.id, dateKey: "once" }, () =>
      sendPushToRoles(INTERNAL_ROLES, {
        title: "Reunião em breve",
        body: `Reunião com ${who} em menos de 30 minutos.`,
        tag: `meeting-${m.id}`,
        url: "/dashboard",
      })
    );
  }
}

// Quantos dias faltam até o próximo dia-do-mês configurado (paymentDueDay),
// olhando pro vencimento deste mês, ou do mês que vem se o deste mês já
// passou há mais de 3 dias (evita ficar "avisando vencimento" de um dia que
// já ficou pra trás há semanas).
function daysUntilDueDay(dueDay) {
  const now = utcMidnight(new Date());
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dueDay));
  let diff = Math.round((thisMonth.getTime() - now.getTime()) / DAY_MS);
  if (diff < -3) {
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, dueDay));
    diff = Math.round((nextMonth.getTime() - now.getTime()) / DAY_MS);
  }
  return diff;
}

async function checkPatientSessions() {
  const patients = await prisma.patient.findMany({
    where: { status: { not: "encerrado" } },
    include: { portalUser: { select: { id: true } } },
  });
  const key = todayKey();
  const todayStr = key;
  const tomorrowStr = dateKeyOf(new Date(Date.now() + DAY_MS));

  for (const patient of patients) {
    if (!patient.portalUser.length) continue; // sem login de portal, ninguém pra avisar
    const userIds = patient.portalUser.map((u) => u.id);

    const sessionDates = new Set();
    const schedule = computeSessionSchedule(patient);
    if (schedule) schedule.dates.forEach((d) => sessionDates.add(dateKeyOf(d)));
    if (patient.nextSessionAt) sessionDates.add(dateKeyOf(patient.nextSessionAt));

    const horario = patient.sessionTime ? ` às ${patient.sessionTime}` : "";

    if (sessionDates.has(todayStr)) {
      await notifyOnce({ kind: "patient_session_today", refId: patient.id, dateKey: key }, () =>
        sendPushToUserIds(userIds, {
          title: "Sessão hoje",
          body: `Você tem sessão marcada para hoje${horario}.`,
          tag: `session-${patient.id}`,
          url: "/paciente-portal",
        })
      );
    }
    if (sessionDates.has(tomorrowStr)) {
      await notifyOnce({ kind: "patient_session_tomorrow", refId: patient.id, dateKey: key }, () =>
        sendPushToUserIds(userIds, {
          title: "Sessão amanhã",
          body: `Você tem sessão marcada para amanhã${horario}.`,
          tag: `session-tomorrow-${patient.id}`,
          url: "/paciente-portal",
        })
      );
    }

    // Pagamento — usa o campo paymentStatus (marcado manualmente pelo
    // profissional) quando já está PENDENTE/ATRASADO; se ainda está EM_DIA,
    // usa o dia-do-mês configurado (paymentDueDay) pra avisar "vencendo em
    // breve" antes mesmo do profissional marcar como pendente.
    if (patient.paymentStatus === "ATRASADO") {
      await notifyOnce({ kind: "patient_payment_overdue", refId: patient.id, dateKey: key }, () =>
        sendPushToUserIds(userIds, {
          title: "Pagamento em atraso",
          body: "Seu pagamento está em atraso. Entre em contato para regularizar.",
          tag: `patient-payment-${patient.id}`,
          url: "/paciente-portal",
        })
      );
    } else if (patient.paymentStatus === "PENDENTE") {
      await notifyOnce({ kind: "patient_payment_pending", refId: patient.id, dateKey: key }, () =>
        sendPushToUserIds(userIds, {
          title: "Pagamento pendente",
          body: "Seu pagamento está pendente.",
          tag: `patient-payment-${patient.id}`,
          url: "/paciente-portal",
        })
      );
    } else if (patient.paymentDueDay) {
      const diff = daysUntilDueDay(patient.paymentDueDay);
      if (diff >= 0 && diff <= 3) {
        const quando = diff === 0 ? "hoje" : `em ${diff} dia${diff > 1 ? "s" : ""}`;
        await notifyOnce({ kind: "patient_payment_due_soon", refId: patient.id, dateKey: key }, () =>
          sendPushToUserIds(userIds, {
            title: "Pagamento próximo do vencimento",
            body: `Seu pagamento vence ${quando}.`,
            tag: `patient-payment-${patient.id}`,
            url: "/paciente-portal",
          })
        );
      }
    }
  }
}

let started = false;
function startNotificationJobs() {
  if (started) return;
  started = true;
  if (!isPushConfigured()) {
    console.log("Push desativado (faltam VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY) — job de notificações não vai rodar.");
    return;
  }
  const INTERVAL_MS = 10 * 60 * 1000; // 10 minutos
  async function tick() {
    try {
      await checkClientPayments();
      await checkMeetingsSoon();
      await checkPatientSessions();
    } catch (err) {
      console.error("Erro no job de notificações:", err);
    }
  }
  // Primeira rodada com um pequeno atraso, pra deixar o servidor terminar
  // de subir (conexão com o banco etc.) antes de já sair consultando tudo.
  setTimeout(tick, 15 * 1000);
  setInterval(tick, INTERVAL_MS);
}

module.exports = { startNotificationJobs, notifyClientCreated };
