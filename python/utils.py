import os
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

DEFAULT_MONAD_RPC = os.getenv("MONAD_RPC_URL", "https://testnet-rpc.monad.xyz/")
DEFAULT_CHAIN_ID = int(os.getenv("MONAD_CHAIN_ID", "10143"))

def get_rpc_url() -> str:
    """Returns the configured Monad RPC endpoint."""
    return os.getenv("MONAD_RPC_URL", DEFAULT_MONAD_RPC)

def get_chain_id() -> int:
    """Returns the configured Monad chain ID."""
    return int(os.getenv("MONAD_CHAIN_ID", str(DEFAULT_CHAIN_ID)))

def format_ether(wei_value: int) -> float:
    """Convert wei value to Ether/MON."""
    return wei_value / 10**18

def format_address(address: str) -> str:
    """Formats address to standard checksum or shortened preview."""
    if not address or len(address) < 10:
        return address
    return f"{address[:6]}...{address[-4:]}"

def sample_data_processor(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Placeholder for AI / Data processing pipeline.
    Transforms raw blockchain or sensor data for smart contract consumption.
    """
    processed = {
        "processed": True,
        "input_keys": list(data.keys()),
        "summary": f"Processed {len(data)} items",
        "payload": data
    }
    return processed
