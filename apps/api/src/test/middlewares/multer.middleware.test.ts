import { describe, it, expect } from "vitest";
import { uploadSingleFile, uploadMultipleFiles } from "../../middlewares/multer.middleware";

describe("Multer Middleware", () => {
	it("should export uploadSingleFile and uploadMultipleFiles middlewares", () => {
		expect(uploadSingleFile).toBeDefined();
		expect(typeof uploadSingleFile).toBe("function");
		expect(uploadMultipleFiles).toBeDefined();
		expect(typeof uploadMultipleFiles).toBe("function");
	});
});
