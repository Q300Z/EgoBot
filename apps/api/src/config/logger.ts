import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname,label",
          },
        }
      : undefined,
});

export class PinoLogger {
  private child: ReturnType<typeof logger.child>;

  constructor(label: string) {
    this.child = logger.child({ label });
  }

  debug(msg: string, meta?: any) {
    this.child.debug(meta || {}, msg);
  }

  info(msg: string, meta?: any) {
    this.child.info(meta || {}, msg);
  }

  warn(msg: string, meta?: any) {
    this.child.warn(meta || {}, msg);
  }

  error(msg: string, err?: any, meta?: any) {
    this.child.error({ err, ...meta }, msg);
  }
}

export const LoggerFactory = {
  getLogger(label: string) {
    return new PinoLogger(label);
  },
};
