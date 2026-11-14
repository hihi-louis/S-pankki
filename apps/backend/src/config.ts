import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // true = also accept browsers opened via a private-network address (192.168.x.x, 10.x.x.x, 172.16-31.x.x, *.local)
  CORS_ALLOW_LAN: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  LLM_API_KEY: z.string().optional(), // chỉ cần khi dùng module chat
  LLM_BASE_URL: z.string().default("https://inference.verda.com/v1"), // endpoint kiểu OpenAI
  LLM_MODEL: z.string().default("kimi-k3-1-pro"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment (see apps/backend/.env.example):");
  for (const i of parsed.error.issues) console.error(`  - ${i.path.join(".")}: ${i.message}`);
  process.exit(1);
}

export const config = {
  databaseUrl: parsed.data.DATABASE_URL,
  port: parsed.data.PORT,
  corsAllowLan: parsed.data.CORS_ALLOW_LAN,
  corsOrigins: parsed.data.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
  llmApiKey: parsed.data.LLM_API_KEY,
  llmBaseUrl: parsed.data.LLM_BASE_URL,
  llmModel: parsed.data.LLM_MODEL,
};
