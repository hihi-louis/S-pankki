import { Router } from "express";
import { chatRequestSchema } from "./chat.schema.js";
import { chatService } from "./chat.service.js";

/** Gắn tại /chat */
export const chatRouter = Router();

chatRouter.post("/", async (req, res, next) => {
  try {
    res.json(await chatService.chat(chatRequestSchema.parse(req.body)));
  } catch (e) {
    next(e);
  }
});
