import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const MONAD_TESTNET_PARAMS = {
  chainId: '0x279f', // 10143 in hex
  chainName: 'Monad Testnet',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: ['https://testnet-rpc.monad.xyz/'],
  blockExplorerUrls: ['https://testnet.monadexplorer.com/'],
};

const COUNTER_ABI = [
  'function number() view returns (uint256)',
  'function increment() public',
  'function setNumber(uint256 newNumber) public'
];

export default function App() {
  const [account, setAccount] = useState<string>('');
  const [chainId, setChainId] = useState<number | null>(null);
  const [contractAddress, setContractAddress] = useState<string>('');
  const [counterValue, setCounterValue] = useState<string | null>(null);
  const [newNumberInput, setNewNumberInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [backendHealth, setBackendHealth] = useState<{ status: string; timestamp: string } | null>(null);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);

  useEffect(() => {
    checkBackendHealth();
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        }
      });

      window.ethereum.request({ method: 'eth_chainId' }).then((hexChainId: string) => {
        setChainId(parseInt(hexChainId, 16));
      });

      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        setAccount(accounts[0] || '');
      });

      window.ethereum.on('chainChanged', (hexChainId: string) => {
        setChainId(parseInt(hexChainId, 16));
      });
    }
  }, []);

  const checkBackendHealth = async () => {
    try {
      const res = await fetch('http://localhost:3001/health');
      if (res.ok) {
        const data = await res.json();
        setBackendHealth(data);
      }
      const blockRes = await fetch('http://localhost:3001/api/monad/block');
      if (blockRes.ok) {
        const blockData = await blockRes.json();
        setLatestBlock(blockData.blockNumber);
      }
    } catch {
      // Backend might be offline currently
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask / Web3 provider not detected!');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
      const hexChainId = await window.ethereum.request({ method: 'eth_chainId' });
      setChainId(parseInt(hexChainId, 16));
    } catch (err: any) {
      setStatusMsg(`Connection error: ${err.message}`);
    }
  };

  const switchToMonad = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: MONAD_TESTNET_PARAMS.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [MONAD_TESTNET_PARAMS],
          });
        } catch (addError: any) {
          setStatusMsg(`Failed to add network: ${addError.message}`);
        }
      } else {
        setStatusMsg(`Failed to switch network: ${switchError.message}`);
      }
    }
  };

  const readCounter = async () => {
    if (!contractAddress) {
      setStatusMsg('Please enter a Counter contract address.');
      return;
    }
    try {
      setLoading(true);
      setStatusMsg('Reading contract state...');
      const provider = window.ethereum
        ? new ethers.BrowserProvider(window.ethereum)
        : new ethers.JsonRpcProvider(MONAD_TESTNET_PARAMS.rpcUrls[0]);
      const contract = new ethers.Contract(contractAddress, COUNTER_ABI, provider);
      const val = await contract.number();
      setCounterValue(val.toString());
      setStatusMsg('Counter state loaded successfully.');
    } catch (err: any) {
      setStatusMsg(`Read error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const incrementCounter = async () => {
    if (!contractAddress || !window.ethereum) {
      setStatusMsg('Please connect wallet and enter contract address.');
      return;
    }
    try {
      setLoading(true);
      setStatusMsg('Submitting transaction to Monad...');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, COUNTER_ABI, signer);
      const tx = await contract.increment();
      setStatusMsg(`Tx submitted: ${tx.hash}. Awaiting confirmation...`);
      await tx.wait();
      setStatusMsg(`Tx confirmed! ${tx.hash}`);
      await readCounter();
    } catch (err: any) {
      setStatusMsg(`Tx error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetNumber = async () => {
    if (!contractAddress || !window.ethereum || !newNumberInput) {
      setStatusMsg('Please provide contract address, value, and connect wallet.');
      return;
    }
    try {
      setLoading(true);
      setStatusMsg('Sending setNumber transaction...');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, COUNTER_ABI, signer);
      const tx = await contract.setNumber(BigInt(newNumberInput));
      setStatusMsg(`Tx submitted: ${tx.hash}. Waiting for block inclusion...`);
      await tx.wait();
      setStatusMsg(`Number updated!`);
      setNewNumberInput('');
      await readCounter();
    } catch (err: any) {
      setStatusMsg(`Tx error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isMonadChain = chainId === 10143;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand">
          <div className="logo-badge">🟣</div>
          <div>
            <h1>Monad Hackathon</h1>
            <p className="subtitle">Foundry + Express + React + Python Fullstack Scaffolding</p>
          </div>
        </div>

        <div className="wallet-section">
          {account ? (
            <div className="account-pill">
              <span className={`status-dot ${isMonadChain ? 'online' : 'warning'}`}></span>
              <span>{account.slice(0, 6)}...{account.slice(-4)}</span>
              {!isMonadChain && (
                <button className="btn-sm switch-btn" onClick={switchToMonad}>
                  Switch to Monad (10143)
                </button>
              )}
            </div>
          ) : (
            <button className="btn-primary" onClick={connectWallet}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <main className="grid-layout">
        {/* Network & Backend Status Card */}
        <section className="card">
          <div className="card-header">
            <h3>⚡ System & Network Status</h3>
            <span className={`badge ${backendHealth ? 'badge-success' : 'badge-neutral'}`}>
              {backendHealth ? 'Backend Online' : 'Backend Standby'}
            </span>
          </div>

          <div className="stats-list">
            <div className="stat-item">
              <span className="stat-label">Network</span>
              <span className="stat-value font-mono">Monad Testnet (10143)</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">RPC Endpoint</span>
              <span className="stat-value font-mono truncate">{MONAD_TESTNET_PARAMS.rpcUrls[0]}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Latest Block (via API)</span>
              <span className="stat-value font-mono">{latestBlock !== null ? `#${latestBlock}` : 'Querying...'}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Connected Chain ID</span>
              <span className={`stat-value font-mono ${isMonadChain ? 'text-green' : 'text-yellow'}`}>
                {chainId ? `${chainId} ${isMonadChain ? '(Match)' : '(Not Monad)'}` : 'Wallet not connected'}
              </span>
            </div>
          </div>

          <button className="btn-secondary" onClick={checkBackendHealth} style={{ marginTop: '1rem', width: '100%' }}>
            🔄 Refresh Status
          </button>
        </section>

        {/* Counter Contract Interaction Card */}
        <section className="card">
          <div className="card-header">
            <h3>📜 Smart Contract (Counter.sol)</h3>
            <span className="badge badge-purple">EVM on Monad</span>
          </div>

          <div className="input-group">
            <label>Deployed Contract Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="counter-display">
            <div className="counter-metric">
              <span className="counter-num">{counterValue !== null ? counterValue : '--'}</span>
              <span className="counter-label">Current Counter Number</span>
            </div>
            <button className="btn-secondary" onClick={readCounter} disabled={loading}>
              Fetch Value
            </button>
          </div>

          <div className="actions-grid">
            <button
              className="btn-primary"
              onClick={incrementCounter}
              disabled={loading || !account || !isMonadChain}
            >
              + Increment Number
            </button>

            <div className="set-group">
              <input
                type="number"
                placeholder="New value"
                value={newNumberInput}
                onChange={(e) => setNewNumberInput(e.target.value)}
              />
              <button
                className="btn-secondary"
                onClick={handleSetNumber}
                disabled={loading || !account || !isMonadChain || !newNumberInput}
              >
                Set
              </button>
            </div>
          </div>

          {statusMsg && (
            <div className="status-banner">
              <span>{statusMsg}</span>
            </div>
          )}
        </section>

        {/* Scaffolding Modules Directory */}
        <section className="card full-width">
          <h3>📦 Project Modules & Architecture</h3>
          <div className="modules-grid">
            <div className="module-item">
              <h4>1. Smart Contracts</h4>
              <p className="text-muted">Foundry project with <code>Counter.sol</code>, deployment script, and test suite configured for Monad's 10,000 TPS EVM.</p>
              <div className="tag-list">
                <span className="tag">Solidity ^0.8.13</span>
                <span className="tag">Foundry</span>
                <span className="tag">Forge Test</span>
              </div>
            </div>

            <div className="module-item">
              <h4>2. Backend Service</h4>
              <p className="text-muted">Node.js + Express + TypeScript service interfacing with Monad RPC and exposed via REST APIs.</p>
              <div className="tag-list">
                <span className="tag">TypeScript</span>
                <span className="tag">Express</span>
                <span className="tag">ethers.js v6</span>
              </div>
            </div>

            <div className="module-item">
              <h4>3. Python Pipeline</h4>
              <p className="text-muted">Python processing layer with Web3 connection utilities for automated data indexing, bots, or machine learning.</p>
              <div className="tag-list">
                <span className="tag">Python 3.14</span>
                <span className="tag">Web3.py</span>
                <span className="tag">Pipeline</span>
              </div>
            </div>

            <div className="module-item">
              <h4>4. Frontend App</h4>
              <p className="text-muted">React + Vite + TypeScript frontend with instant wallet connectivity, dark theme, and contract execution.</p>
              <div className="tag-list">
                <span className="tag">React 18</span>
                <span className="tag">Vite</span>
                <span className="tag">Vanilla CSS</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
