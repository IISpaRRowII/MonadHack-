import { Router, Request, Response } from "express";
import { tapToOwnService } from "../services/tapToOwn.service.js";
import { authService } from "../services/auth.service.js";
import { config } from "../config.js";


export const tapToOwnRouter = Router();

// 1. Obtener los lotes de café con su estado en vivo
tapToOwnRouter.get("/assets", (_req: Request, res: Response) => {
  const assets = tapToOwnService.getAssets();
  res.json({
    success: true,
    data: assets,
    meta: {
      totalAssets: assets.length,
      network: "Monad",
      chainId: config.monad.chainId,
    },
  });
});

// 1b. Crear un nuevo fondo de inversión tokenizado
tapToOwnRouter.post("/assets", (req: Request, res: Response) => {
  const { company, products, totalFundValue, origin, altitude, notes, color } = req.body;

  if (!company || !products || totalFundValue === undefined || totalFundValue === null) {
    return res.status(400).json({
      success: false,
      error: "Se requieren los campos: 'company' (Empresa), 'products' (Productos) y 'totalFundValue' (Valor total del fondo en MON)",
    });
  }

  const numVal = parseFloat(totalFundValue);
  if (isNaN(numVal) || numVal <= 0) {
    return res.status(400).json({
      success: false,
      error: "'totalFundValue' debe ser un número positivo en MON",
    });
  }

  const newAsset = tapToOwnService.createAsset({
    company: String(company).trim(),
    products: String(products).trim(),
    totalFundValue: numVal,
    origin: origin ? String(origin).trim() : undefined,
    altitude: altitude ? String(altitude).trim() : undefined,
    notes: Array.isArray(notes) ? notes : undefined,
    color,
  });

  res.status(201).json({
    success: true,
    message: `¡Fondo '${newAsset.name}' creado con éxito y dividido en 1,000 micro-acciones!`,
    data: newAsset,
  });
});

// 2. Detalle de un lote específico con lista de accionistas
tapToOwnRouter.get("/assets/:id", (req: Request, res: Response) => {
  const assetId = parseInt(req.params.id, 10);
  if (isNaN(assetId) || assetId < 0) {
    return res.status(400).json({ success: false, error: "ID de activo inválido" });
  }

  const asset = tapToOwnService.getAssetById(assetId);
  if (!asset) {
    return res.status(404).json({ success: false, error: "Lote de café no encontrado" });
  }

  res.json({ success: true, data: asset });
});

// 3. Ejecutar un TAP (Comprar micro-acciones)
tapToOwnRouter.post("/tap", (req: Request, res: Response) => {
  const { assetId, sharesCount = 1, txHash } = req.body;
  let buyerAddress = req.body.buyerAddress;

  // Verificar si viene con sesión autenticada de Monad
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "") || req.body.sessionToken;
  if (token) {
    const session = authService.getSession(token);
    if (session) {
      buyerAddress = session.address;
    }
  }

  if (assetId === undefined || !buyerAddress) {
    return res.status(400).json({
      success: false,
      error: "Se requiere 'assetId' (0-3) y una wallet conectada en Monad ('buyerAddress' o 'sessionToken')",
    });
  }

  const result = tapToOwnService.tapToBuy(Number(assetId), String(buyerAddress), Number(sharesCount), txHash);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }


  res.json({
    success: true,
    message: `¡Tap exitoso! Adquiridas ${sharesCount} acción(es) del Lote #${assetId}`,
    buyer: buyerAddress,
    event: result.event,
  });
});


// 4. Vender acciones de vuelta a la bonding curve
tapToOwnRouter.post("/sell", (req: Request, res: Response) => {
  const { assetId, sellerAddress, sharesCount = 1 } = req.body;

  if (assetId === undefined || !sellerAddress) {
    return res.status(400).json({
      success: false,
      error: "Se requiere 'assetId' (0-3) y 'sellerAddress'",
    });
  }

  const result = tapToOwnService.tapToSell(Number(assetId), String(sellerAddress), Number(sharesCount));
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  res.json({
    success: true,
    message: `Venta exitosa de ${sharesCount} acción(es) del Lote #${assetId}`,
    event: result.event,
  });
});

// 5. Reclamar dividendos acumulados
tapToOwnRouter.post("/claim-dividends", (req: Request, res: Response) => {
  const { address } = req.body;
  if (!address) {
    return res.status(400).json({ success: false, error: "Se requiere 'address'" });
  }

  const claimResult = tapToOwnService.claimDividends(String(address));
  res.json({
    success: true,
    message: `Se han reclamado ${claimResult.claimedTotal} MON en dividendos`,
    data: claimResult,
  });
});

// 6. Portafolio de Inversión y Estadísticas por usuario
tapToOwnRouter.get("/portfolio/:address", (req: Request, res: Response) => {
  const address = req.params.address;
  if (!address) {
    return res.status(400).json({ success: false, error: "Se requiere address" });
  }
  const portfolio = tapToOwnService.getUserPortfolio(address);
  res.json({ success: true, data: portfolio });
});

// 7. Leaderboard global (Patrones y Top Inversionistas)
tapToOwnRouter.get("/leaderboard", (_req: Request, res: Response) => {
  const leaderboard = tapToOwnService.getLeaderboard();
  res.json({ success: true, data: leaderboard });
});

// 7. Historial de eventos recientes
tapToOwnRouter.get("/events", (_req: Request, res: Response) => {
  const events = tapToOwnService.getRecentEvents();
  res.json({ success: true, data: events });
});

// 8. SERVER-SENT EVENTS (SSE): Stream en vivo para proyectores y celulares (300ms latency)
tapToOwnRouter.get("/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  tapToOwnService.addSSEClient(res);
});

// 9. Información del Contrato Inteligente en Monad
tapToOwnRouter.get("/contract-info", (_req: Request, res: Response) => {
  res.json({
    success: true,
    network: {
      name: "Monad Testnet",
      chainId: config.monad.chainId,
      rpcUrl: config.monad.rpcUrl,
    },
    contract: {
      address: config.monad.contractAddress || "Aún no desplegado (Modo simulación en memoria activo)",
      totalAssets: 4,
      sharesPerAsset: 1000,
      dividendRate: "5%",
    },
    sampleAbi: [
      "function buyShares(uint256 assetId, uint256 count) external payable",
      "function sellShares(uint256 assetId, uint256 count) external",
      "function claimDividends(uint256 assetId) external",
      "function getAsset(uint256 assetId) external view returns (uint256 currentSupply, uint256 currentPrice, address patron, uint256 patronShares, uint256 dividendPool)",
      "event ShareBought(uint256 indexed assetId, address indexed buyer, uint256 shares, uint256 cost)",
      "event OwnershipFlipped(uint256 indexed assetId, address indexed newPatron, address indexed oldPatron)",
    ],
  });
});
