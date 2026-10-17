import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { ethers } from "ethers";
import { config } from "./config.js";
import { tapToOwnRouter } from "./routes/tapToOwn.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { renderDashboardHtml } from "./views/dashboardHtml.js";

// Resolver la ruta a frontend/dist tanto si se ejecuta desde /backend como desde la raíz
const frontendDistPath = fs.existsSync(path.resolve(process.cwd(), "../frontend/dist"))
  ? path.resolve(process.cwd(), "../frontend/dist")
  : path.resolve(process.cwd(), "frontend/dist");

const app = express();

app.use(cors());
app.use(express.json());

// Logger de desarrollo para ver en paralelo cada petición en la consola
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path !== "/api/tap-to-own/stream") {
      console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Rutas de Autenticación con Wallet Monad (SIWE - Sign-In with Ethereum/Monad)
app.use("/api/auth", authRouter);

// Rutas de la lógica de negocio Tap-to-Own RWA
app.use("/api/tap-to-own", tapToOwnRouter);

// Health Check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "monad-backend-tap-to-own",
    timestamp: new Date().toISOString(),
    network: {
      chainId: config.monad.chainId,
      rpcConfigured: Boolean(config.monad.rpcUrl),
      contractConfigured: Boolean(config.monad.contractAddress),
    },
  });
});

// Monad RPC Block Check
app.get("/api/monad/block", async (_req: Request, res: Response) => {
  try {
    const provider = new ethers.JsonRpcProvider(config.monad.rpcUrl);
    const blockNumber = await provider.getBlockNumber();
    res.json({ blockNumber, network: "Monad Testnet" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to fetch block from Monad RPC", details: message });
  }
});

// Monitor Visual del Backend (Panel de control para desarrolladores)
app.get("/monitor", (_req: Request, res: Response) => {
  res.send(renderDashboardHtml());
});

app.get("/dashboard", (_req: Request, res: Response) => {
  res.send(renderDashboardHtml());
});

// Integración de Frontend: Servir archivos estáticos del build de React
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
}

// Fallback SPA: Para cualquier ruta web, entregar la App de React
app.get("*", (req: Request, res: Response, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/health")) {
    return next();
  }
  const indexPath = path.join(frontendDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.send(renderDashboardHtml());
});

app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`⚡ Monad Tap-to-Own: APLICACIÓN COMPLETA INTEGRADA`);
  console.log(`🌐 Frontend (React):  http://localhost:${config.port}`);
  console.log(`📡 Backend APIs:     http://localhost:${config.port}/api/tap-to-own/assets`);
  console.log(`🖥️  Monitor Dev:      http://localhost:${config.port}/monitor`);
  console.log(`⚡ SSE Stream:       http://localhost:${config.port}/api/tap-to-own/stream`);
  console.log(`====================================================`);
});
