const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  // Fail loudly at boot rather than silently signing tokens with "undefined".
  throw new Error("JWT_SECRET não configurado nas variáveis de ambiente.");
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, clientId: user.clientId || null },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token ausente." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role, name: payload.name, clientId: payload.clientId || null };
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

// Usage: requireRole("SOCIO", "GESTOR")
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Sem permissão para este recurso." });
    }
    return next();
  };
}

module.exports = { signToken, requireAuth, requireRole, JWT_SECRET };
