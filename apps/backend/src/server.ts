import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { errorHandler } from "./lib/errors.js";
import { requestContext } from "./lib/request-context.js";
import { router } from "./routes.js";

const app = express();

// Private-network origins: localhost, 10.x, 172.16-31.x, 192.168.x and *.local (mDNS names)
const LAN_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|[\w-]+\.local)(:\d+)?$/;

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header = not a browser cross-origin call (curl, same-origin): allow
      const allowed = !origin || config.corsOrigins.includes(origin) || (config.corsAllowLan && LAN_ORIGIN.test(origin));
      callback(null, allowed);
    },
  }),
);
app.use(express.json());
app.use(requestContext);
app.use(router);

// One public service for a deployment (Railway and similar): if the frontend was built, this server also serves it
// and answers the same API under /api, exactly like the Vite dev proxy does. Without a build nothing changes.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  app.use("/api", router);
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  console.log(`serving the app from ${dist}`);
}

app.use(errorHandler);

app.listen(config.port, () => console.log(`api listening on http://localhost:${config.port}`));
