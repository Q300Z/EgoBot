import { Router } from "express";
import { validate } from "../../../middlewares";
import { AuthController, LoginRequestSchemaV2 } from "../../../modules/auth";

const router: Router = Router();

// Auth V2
router.post("/auth/login", validate(LoginRequestSchemaV2), AuthController.loginV2);

export default router;
