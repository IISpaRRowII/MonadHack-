import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  monad: {
    rpcUrl: process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz/",
    chainId: parseInt(process.env.MONAD_CHAIN_ID || "10143", 10),
    contractAddress: process.env.TAP_TO_OWN_CONTRACT_ADDRESS || process.env.COUNTER_CONTRACT_ADDRESS || "",
  },
};

