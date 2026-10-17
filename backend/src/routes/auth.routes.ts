import { Router, Request, Response } from "express";
import { authService } from "../services/auth.service.js";
import { config } from "../config.js";

export const authRouter = Router();

// 1. Solicitar reto / nonce para firmar con la wallet de Monad
authRouter.post("/challenge", (req: Request, res: Response) => {
  const { address } = req.body;
  if (!address || typeof address !== "string" || !address.startsWith("0x")) {
    return res.status(400).json({
      success: false,
      error: "Se requiere una dirección EVM válida ('0x...') de Monad",
    });
  }

  const challenge = authService.generateChallenge(address);
  res.json({
    success: true,
    data: {
      address,
      ...challenge,
      network: "Monad Testnet",
      networkParams: {
        chainId: "0x279f", // 10143 en hexadecimal
        chainName: "Monad Testnet",
        nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
        rpcUrls: [config.monad.rpcUrl],
        blockExplorerUrls: ["https://testnet.monadexplorer.com/"],
      },
    },
  });
});

// 2. Verificar la firma de la wallet
authRouter.post("/verify", (req: Request, res: Response) => {
  const { address, signature } = req.body;

  if (!address || !signature) {
    return res.status(400).json({
      success: false,
      error: "Se requiere 'address' y 'signature' generada por la wallet",
    });
  }

  const result = authService.verifySignature(address, signature);
  if (!result.success) {
    return res.status(401).json({ success: false, error: result.error });
  }

  res.json({
    success: true,
    message: "¡Autenticación con Monad exitosa!",
    sessionToken: result.sessionToken,
    address,
    network: "Monad Testnet",
    chainId: config.monad.chainId,
  });
});

// 3. Obtener sesión actual
authRouter.get("/me", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  const session = authService.getSession(token);
  if (!session) {
    return res.status(401).json({
      authenticated: false,
      message: "No hay sesión activa o el token es inválido",
    });
  }

  res.json({
    authenticated: true,
    user: {
      address: session.address,
      createdAt: session.createdAt,
      network: "Monad Testnet",
      chainId: config.monad.chainId,
    },
  });
});
