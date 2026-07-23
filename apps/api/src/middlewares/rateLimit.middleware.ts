import rateLimit from "express-rate-limit";

// Rate limiting strict pour l'authentification (10 requêtes par 15 minutes sur les routes auth)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.",
  },
});

// Rate limiting pour la création de messages (30 requêtes par minute sur la création de messages)
export const messageRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Limite de création de messages atteinte. Veuillez ralentir.",
  },
});
