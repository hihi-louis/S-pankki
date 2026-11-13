import "dotenv/config";
import express from "express";
import cors from "cors";
import { router } from "./routes.js";

const app = express();
const origins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: origins }));
app.use(express.json());
app.use(router);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`api listening on http://localhost:${port}`));
