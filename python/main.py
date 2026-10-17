import sys
import json
from utils import get_rpc_url, get_chain_id, format_address, sample_data_processor

def main():
    print("=" * 50)
    print("  Monad Hackathon - Python Data / Logic Layer")
    print("=" * 50)
    
    rpc_url = get_rpc_url()
    chain_id = get_chain_id()
    
    print(f"[*] Target RPC URL : {rpc_url}")
    print(f"[*] Chain ID       : {chain_id}")
    
    # Optional Web3 connection check
    try:
        from web3 import Web3
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        is_connected = w3.is_connected()
        print(f"[*] Web3 Connected : {is_connected}")
        if is_connected:
            latest_block = w3.eth.block_number
            print(f"[*] Latest Block   : {latest_block}")
    except ImportError:
        print("[!] web3 package not installed yet. Run: pip install -r requirements.txt")
    except Exception as e:
        print(f"[!] Warning connecting to RPC: {e}")
        
    # Sample logic / AI pipeline execution
    sample_input = {
        "event": "HackathonInit",
        "chain": "Monad",
        "sample_metric": 42
    }
    result = sample_data_processor(sample_input)
    print("\n[*] Running sample data processing pipeline:")
    print(json.dumps(result, indent=2))
    print("\n[+] Python service initialized successfully.")

if __name__ == "__main__":
    main()
