import express, { Request, Response } from "express";
import cors from "cors";
import { ethers } from "ethers";
import { config } from "./config.js";
import { tapToOwnRouter } from "./routes/tapToOwn.routes.js";
import { authRouter } from "./routes/auth.routes.js";

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

// Endpoint raíz de la API
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Monad Tap-to-Own Backend API",
    frontend: "http://localhost:3002",
    message: "Toda la interfaz visual se encuentra centralizada en el frontend",
    endpoints: {
      health: "/health",
      assets: "/api/tap-to-own/assets",
      events: "/api/tap-to-own/events",
      leaderboard: "/api/tap-to-own/leaderboard",
      stream: "/api/tap-to-own/stream",
    },
  });
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

app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`⚡ Monad Tap-to-Own Backend listo`);
  console.log(`📡 Servidor API:    http://localhost:${config.port}`);
  console.log(`🖥️  Frontend dApp:  http://localhost:3002`);
  console.log(`⚡ SSE Stream:      http://localhost:${config.port}/api/tap-to-own/stream`);
  console.log(`====================================================`);
});
