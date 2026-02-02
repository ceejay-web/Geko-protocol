
import React, { useState, useEffect } from 'react';
import { universalWallet } from '../services/universalWallet';
import { WalletData } from '../types';

// Export ConnectMode as it is imported by App.tsx
export type ConnectMode = 'wallets' | 'manual';

interface ConnectWalletProps {
  onConnect: (address: string | WalletData) => void;
  onClose: () => void;
  // Add initialMode prop used in App.tsx
  initialMode?: ConnectMode;
}

interface WalletOption {
  name: string;
  id: string; 
  icon: string;
  color: string;
  type: 'evm' | 'svm' | 'sim';
}

export const ConnectWallet: React.FC<ConnectWalletProps> = ({ onConnect, onClose, initialMode = 'wallets' }) => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  // Set initial view state based on the initialMode prop
  const [view, setView] = useState<ConnectMode>(initialMode);

  useEffect(() => {
    if (initialMode) setView(initialMode);
  }, [initialMode]);

  const wallets: WalletOption[] = [
    { name: 'MetaMask', id: 'metamask', type: 'evm', color: 'text-orange-500', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { name: 'Coinbase', id: 'coinbase', type: 'evm', color: 'text-blue-600', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z' },
    { name: 'Phantom', id: 'phantom', type: 'svm', color: 'text-purple-500', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z' },
    { name: 'Trust Wallet', id: 'trust', type: 'evm', color: 'text-blue-400', icon: 'M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z' },
    { name: 'Simulated Node', id: 'sim', type: 'sim', color: 'text-emerald-500', icon: 'M13 10V3L4 14h7v7l9-11h-7z' }
  ];

  const handleConnect = async (wallet: WalletOption) => {
    setConnecting(wallet.id);
    setError('');
    try {
        let data: WalletData;
        if (wallet.type === 'evm') {
            data = await universalWallet.connectEVM(wallet.name);
        } else if (wallet.type === 'svm') {
            data = await universalWallet.connectSolana();
        } else {
            // Updated Simulated Node with full protocol identity specs
            data = {
                address: '0xSIM_' + Math.floor(Math.random() * 10000).toString(16).toUpperCase(),
                source: 'Simulation',
                chainType: 'evm',
                balances: [
                  { symbol: 'ETH', amount: '1.50', valueUsd: '4,500.00' },
                  { symbol: 'USDT', amount: '10,000.00', valueUsd: '10,000.00' }
                ],
                protocolBalances: [
                  { symbol: 'USDT', amount: '25,000.00', valueUsd: '25,000.00' }
                ],
                history: []
            };
        }
        onConnect(data);
    } catch (e: any) {
        setError(e.message || "Connection failed");
        setConnecting(null);
    }
  };

  const handleManualConnect = () => {
    if (!manualAddress.trim()) {
      setError("Please enter a valid node address");
      return;
    }
    setConnecting('manual');
    // The App component now handles fetching real balances for this string address
    onConnect(manualAddress.trim());
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#181C25] border border-[#2B3139] rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-8 border-b border-[#2B3139] bg-[#1E2329] flex justify-between items-center">
            <h2 className="text-xl font-black text-white italic uppercase tracking-tighter">Identity Uplink</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        <div className="p-8 space-y-4">
            {error && (
                <div className="p-4 bg-rose-900/20 border border-rose-500/30 rounded-2xl text-xs text-rose-400 font-bold uppercase text-center">{error}</div>
            )}

            {view === 'wallets' ? (
                <div className="grid grid-cols-1 gap-3">
                    {wallets.map(w => (
                        <button 
                            key={w.id} 
                            disabled={!!connecting}
                            onClick={() => handleConnect(w)}
                            className="flex items-center justify-between p-5 bg-[#1E2329] border border-[#2B3139] rounded-3xl hover:border-indigo-500/50 transition-all group disabled:opacity-50"
                        >
                            <div className="flex items-center space-x-4">
                                <div className={`p-3 rounded-2xl bg-[#0B0E11] ${w.color}`}>
                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d={w.icon}/></svg>
                                </div>
                                <span className="font-black text-gray-200 uppercase text-sm">{w.name}</span>
                            </div>
                            {connecting === w.id ? (
                                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg className="w-4 h-4 text-gray-600 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                            )}
                        </button>
                    ))}
                    <button onClick={() => setView('manual')} className="text-center py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-gray-300">Manual Address Entry</button>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-2">Enter Public Key</label>
                        <input 
                            type="text" 
                            value={manualAddress}
                            onChange={(e) => {
                              setManualAddress(e.target.value);
                              setError('');
                            }}
                            placeholder="0x... or Solana Address"
                            className="w-full bg-[#0B0E11] border border-[#2B3139] rounded-2xl px-6 py-5 text-sm font-mono focus:border-indigo-500 outline-none transition-colors"
                        />
                    </div>
                    <button 
                        disabled={connecting === 'manual'}
                        onClick={handleManualConnect}
                        className="w-full py-5 bg-indigo-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                        {connecting === 'manual' && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        <span>{connecting === 'manual' ? 'Establishing link...' : 'Establish Link'}</span>
                    </button>
                    <button onClick={() => { setView('wallets'); setError(''); }} className="w-full text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Back to Providers</button>
                </div>
            )}
        </div>
        
        <div className="p-4 bg-[#0B0E11] border-t border-[#2B3139] text-center">
            <span className="text-[9px] text-gray-600 font-bold uppercase tracking-[0.3em]">Encrypted Handshake Required</span>
        </div>
      </div>
    </div>
  );
};
