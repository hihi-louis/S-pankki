import { Router } from "express";
import { HttpError } from "../../lib/errors.js";
import type { ChatEvent } from "./agent.js";
import { chatRequestSchema } from "./chat.schema.js";
import { chatService } from "./chat.service.js";

/** Gắn tại /chat */
export const chatRouter = Router();

/** Trả lời một lần (không streaming). */
chatRouter.post("/", async (req, res, next) => {
  try {
    res.json(await chatService.chat(chatRequestSchema.parse(req.body)));
  } catch (e) {
    next(e);
  }
});

/** Trả lời dạng Server-Sent Events: status (đang làm gì), delta (từng đoạn chữ), reset, final (kết quả đầy đủ) hoặc error. */
chatRouter.post("/stream", async (req, res, next) => {
  let body;
  try {
    body = chatRequestSchema.parse(req.body);
  } catch (e) {
    next(e); // lỗi đầu vào: trả JSON 400 bình thường trước khi mở stream
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const ctrl = new AbortController();
  res.on("close", () => ctrl.abort()); // client ngắt kết nối thì dừng gọi LLM
  const deadline = setTimeout(() => ctrl.abort(), 55_000);
  const send = (event: ChatEvent | { type: "error"; message: string }) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const response = await chatService.chat(body, send, ctrl.signal);
    send({ type: "final", response });
  } catch (e) {
    if (!(e instanceof HttpError)) console.error("[chat/stream]", e);
    send({
      type: "error",
      message: e instanceof HttpError ? e.message : "The assistant took too long. Please try again.",
    });
  } finally {
    clearTimeout(deadline);
    res.end();
  }
});
