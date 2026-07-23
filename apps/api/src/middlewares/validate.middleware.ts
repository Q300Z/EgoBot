import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export interface RequestValidationSchemas {
  body?: ZodSchema<any>;
  query?: ZodSchema<any>;
  params?: ZodSchema<any>;
}

export function validateRequest(schemas: RequestValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        schemas.query.parse(req.query);
      }
      if (schemas.params) {
        schemas.params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: "Données de requête invalides",
          details: error.issues.map((e: any) => ({ path: e.path.join("."), message: e.message })),
        });
      }
      next(error);
    }
  };
}
