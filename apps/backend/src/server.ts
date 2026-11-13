import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { errorHandler } from "./lib/errors.js";
import { router } from "./routes.js";

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());
app.use(router);
app.use(errorHandler);

app.listen(config.port, () => console.log(`api listening on http://localhost:${config.port}`));
