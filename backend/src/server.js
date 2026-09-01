require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const clientRoutes = require("./routes/clients");
const taskRoutes = require("./routes/tasks");
const paymentRoutes = require("./routes/payments");
const pendencyRoutes = require("./routes/pendencies");
const leadRoutes = require("./routes/leads");
const meetingRoutes = require("./routes/meetings");
const userRoutes = require("./routes/users");
const reportRoutes = require("./routes/reports");

const app = express();

// FRONTEND_URL can be a comma-separated list (e.g. Vercel prod + preview URLs).
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/pendencies", pendencyRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/reports", reportRoutes);

app.use((req, res) => res.status(404).json({ error: "Rota não encontrada." }));

// Centralized error handler — keeps stack traces out of API responses.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`TurbinaADS backend rodando na porta ${PORT}`));
