import { ethers } from "ethers";
import crypto from "crypto";
import { config } from "../config.js";

interface ChallengeSession {
  address: string;
  nonce: string;
  message: string;
  expiresAt: number;
}

interface UserSession {
  address: string;
  sessionToken: string;
  createdAt: number;
  lastActive: number;
}

class AuthService {
  // Retos temporales pendientes de firma (address.toLowerCase() => ChallengeSession)
  private pendingChallenges: Map<string, ChallengeSession> = new Map();

  // Sesiones autenticadas activas (sessionToken => UserSession)
  private activeSessions: Map<string, UserSession> = new Map();

  /**
   * Generar mensaje de reto SIWE (Sign-In with Ethereum / Monad)
   */
  public generateChallenge(rawAddress: string): { nonce: string; message: string; chainId: number } {
    const address = rawAddress.toLowerCase();
    const nonce = crypto.randomBytes(16).toString("hex");
    const timestamp = new Date().toISOString();

    const message = [
      "========================================",
      "   MONAD TAP-TO-OWN - AUTENTICACIÓN    ",
      "========================================",
      "Firma este mensaje para verificar la propiedad de tu wallet y acceder a la plataforma gamificada de RWA en Monad.",
      "",
      `Wallet: ${rawAddress}`,
      `Red: Monad Testnet`,
      `Chain ID: ${config.monad.chainId}`,
      `Nonce: ${nonce}`,
      `Fecha: ${timestamp}`,
      "",
      "Esta solicitud no cuesta comisiones (0 gas) ni transfiere fondos.",
      "========================================",
    ].join("\n");

    this.pendingChallenges.set(address, {
      address,
      nonce,
      message,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutos de validez
    });

    return {
      nonce,
      message,
      chainId: config.monad.chainId,
    };
  }

  /**
   * Verificar la firma criptográfica con Monad
   */
  public verifySignature(
    rawAddress: string,
    signature: string
  ): { success: boolean; sessionToken?: string; error?: string } {
    const address = rawAddress.toLowerCase();
    const challenge = this.pendingChallenges.get(address);

    if (!challenge) {
      return { success: false, error: "No se encontró un reto de inicio de sesión activo para esta wallet. Solicita un nuevo nonce." };
    }

    if (Date.now() > challenge.expiresAt) {
      this.pendingChallenges.delete(address);
      return { success: false, error: "El reto ha expirado. Por favor, solicita una nueva firma." };
    }

    try {
      // Recuperar la dirección firmante a partir del mensaje y la firma usando ethers.js
      const recoveredAddress = ethers.verifyMessage(challenge.message, signature);

      if (recoveredAddress.toLowerCase() !== address) {
        return { success: false, error: "Firma inválida: La clave privada no coincide con la dirección proporcionada." };
      }

      // Firma válida: creamos una sesión autenticada
      this.pendingChallenges.delete(address);
      const sessionToken = "monad_sess_" + crypto.randomBytes(32).toString("hex");

      this.activeSessions.set(sessionToken, {
        address: rawAddress,
        sessionToken,
        createdAt: Date.now(),
        lastActive: Date.now(),
      });

      return {
        success: true,
        sessionToken,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido al verificar firma";
      return { success: false, error: `Fallo criptográfico: ${msg}` };
    }
  }

  /**
   * Validar token de sesión
   */
  public getSession(sessionToken?: string): UserSession | null {
    if (!sessionToken) return null;
    const session = this.activeSessions.get(sessionToken);
    if (!session) return null;

    // Actualizar actividad
    session.lastActive = Date.now();
    return session;
  }
}

export const authService = new AuthService();
