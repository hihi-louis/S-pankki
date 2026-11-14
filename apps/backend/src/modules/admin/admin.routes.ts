import { Router } from "express";
import { HttpError } from "../../lib/errors.js";
import { usageSummary } from "../chat/usage.js";

/** Gắn tại /admin. Chỉ truy cập được trực tiếp từ máy chạy backend: không qua tunnel hay proxy công khai. */
export const adminRouter = Router();

const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

adminRouter.use((req, _res, next) => {
  const forwarded = req.headers["x-forwarded-for"] || req.headers["cf-connecting-ip"] || req.headers.forwarded;
  if (!LOCAL.has(req.socket.remoteAddress ?? "") || forwarded) next(new HttpError(403, "Admin is local-only"));
  else next();
});

/** Token, độ trễ, tỉ lệ cache theo từng đường xử lý (llm, cache, fast). ?since=2026-11-14T10:00:00Z để lọc. */
adminRouter.get("/usage", async (req, res, next) => {
  try {
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    res.json(await usageSummary(since));
  } catch (e) {
    next(e);
  }
});
