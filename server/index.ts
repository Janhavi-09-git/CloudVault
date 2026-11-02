import express from "express";
import cors from "cors";
import { config, HttpError, serviceStatus } from "./config.js";
import { authenticate } from "./auth.js";
import { api } from "./routes.js";

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(",").map((origin) => origin.trim()) ?? true }));
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_req, res) => res.json({ services: serviceStatus() }));
app.use("/api", authenticate, api);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error && typeof error === "object" && "code" in error && error.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: `File exceeds the ${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB upload limit.` });
    return;
  }
  console.error("Request failed:", error);
  res.status(500).json({ error: "The request could not be completed. Check the server logs for details." });
});

app.listen(config.port, () => {
  console.log(`CloudVault API listening on http://localhost:${config.port}`);
});
