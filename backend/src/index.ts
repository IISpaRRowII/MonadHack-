import express, { Request, Response } from "express";
import cors from "cors";
import { ethers } from "ethers";
import { config } from "./config.js";

const app = express();

app.use(cors());
app.use(express.json());

// Health Check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "monad-backend",
    timestamp: new Date().toISOString(),
    network: {
      chainId: config.monad.chainId,
      rpcConfigured: Boolean(config.monad.rpcUrl),
    },
  });
});

// Example route to get latest Monad block
app.get("/api/monad/block", async (_req: Request, res: Response) => {
  try {
    const provider = new ethers.JsonRpcProvider(config.monad.rpcUrl);
    const blockNumber = await provider.getBlockNumber();
    res.json({ blockNumber });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to fetch block from Monad RPC", details: message });
  }
});

// Example route to read Counter status if deployed
app.get("/api/counter", async (_req: Request, res: Response) => {
  if (!config.monad.contractAddress) {
    return res.json({
      message: "COUNTER_CONTRACT_ADDRESS not configured yet in environment",
      number: 0,
    });
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.monad.rpcUrl);
    const abi = ["function number() view returns (uint256)"];
    const contract = new ethers.Contract(config.monad.contractAddress, abi, provider);
    const currentNumber = await contract.number();
    res.json({ address: config.monad.contractAddress, number: currentNumber.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to read counter contract", details: message });
  }
});

app.listen(config.port, () => {
  console.log(`Backend server running on http://localhost:${config.port}`);
});
