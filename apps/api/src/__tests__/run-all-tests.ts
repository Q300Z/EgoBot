import { after } from "node:test";
import { valkeyStream, valkeyReader, valkeyWriter } from "../config/valkey.js";
import { prisma } from "../config/db.js";

import "./unit/controllers/auth.controller.test.js";
import "./unit/controllers/message.controller.test.js";
import "./unit/controllers/admin.controller.test.js";
import "./unit/middlewares/auth.middleware.test.js";
import "./unit/middlewares/validate.middleware.test.js";
import "./unit/middlewares/rateLimit.middleware.test.js";
import "./unit/repositories/repositories.test.js";
import "./unit/services/services.test.js";
import "./unit/events/eventBus.test.js";

// config/valkey.ts instancie trois clients ioredis dès son import : leurs
// sockets et leurs timers de reconnexion maintiennent la boucle d'événements
// en vie, et le process de tests ne se termine jamais — que Valkey tourne ou
// non. La suite restait donc invérifiable, en local comme en CI.
//
// disconnect() est synchrone et s'applique aussi à un client jamais connecté,
// contrairement à quit() qui attend une réponse du serveur — et bloquerait
// donc précisément dans le cas où il n'y a pas de serveur.
after(async () => {
  valkeyStream.disconnect();
  valkeyReader.disconnect();
  valkeyWriter.disconnect();
  await prisma.$disconnect();
});
