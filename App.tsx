
import React, { useState, useEffect, useMemo } from 'react';
import { AssetInfo, MarketData, WalletData, ActiveTrade, LiveTx } from './types';
import SwapView from './components/SwapView';
import TradeView from './components/TradeView';
import GraphsView from './components/GraphsView';
import { PortfolioView } from './components/PortfolioView';
import { ConnectWallet, ConnectMode } from './components/ConnectWallet';
import { CopyTradeView } from './components/CopyTradeView';
import { SupportWidget } from './components/SupportWidget';
import WalletDashboard from './components/WalletDashboard';
import AdminDesk from './components/AdminDesk';
import { LandingPage } from './components/LandingPage';
import { SystemGuardian } from './components/SystemGuardian';
import { fetchRealPrices, fetchCandles } from './services/marketData';
import { authService } from './services/authService';
import { audioSynth } from './services/audioSynth';
import { configService } from './services/configService';
import { universalWallet } from './services/universalWallet';

type ViewMode = 'trade' | 'swap' | 'graphs' | 'portfolio' | 'copy' | 'referral';

const generateMockAssets = (): AssetInfo[] => [
  { symbol: 'BTC', name: 'Bitcoin', price: 82929.94, change24h: 1.45, marketCap: '1.6T', volume24h: '38B' },
  { symbol: 'ETH', name: 'Ethereum', price: 2950.12, change24h: 0.85, marketCap: '350B', volume24h: '15B' },
  { symbol: 'SOL', name: 'Solana', price: 168.45, change24h: 4.12, marketCap: '78B', volume24h: '4.5B' },
  { symbol: 'DOT', name: 'Polkadot', price: 6.80, change24h: -1.20, marketCap: '9B', volume24h: '180M' },
  { symbol: 'USDT', name: 'Tether', price: 1.00, change24h: 0.01, marketCap: '103B', volume24h: '45B' },
];

const App: React.FC = () => {
  const [booting, setBooting] = useState(true);
  const [activeView, setActiveView] = useState<ViewMode>('trade'); 
  const [assets, setAssets] = useState<AssetInfo[]>(generateMockAssets());
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC');
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [notification, setNotification] = useState<{ type: 'Win' | 'Loss' | 'System', msg: string } | null>(null);
  
  const [adminDeskOpen, setAdminDeskOpen] = useState(false);
  const [adminTaps, setAdminTaps] = useState(0);
  const [wallet, setWallet] = useState<(WalletData & { email?: string }) | null>(() => {
    const saved = localStorage.getItem('geko_session');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (wallet) {
      localStorage.setItem('geko_session', JSON.stringify(wallet));
    } else {
      localStorage.removeItem('geko_session');
    }
  }, [wallet]);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  
  const [depositAddress, setDepositAddress] = useState("0xcDEC8d41f2acCCA50064F24A089fC3F52Fadedd0");
  const [vaultBalance, setVaultBalance] = useState("25,000.00");
  
  // High-speed price sync with Coincap fallback
  useEffect(() => {
    const syncPrices = async () => {
      try {
        const res = await fetch('/api/binance/prices');
        if (res.ok) {
          const data = await res.json();
          const realPrices: any = {};
          data.forEach((item: any) => {
            realPrices[item.symbol.replace('USDT', '')] = {
              price: parseFloat(item.lastPrice),
              change: parseFloat(item.priceChangePercent)
            };
          });
          setAssets(prev => prev.map(a => {
            const update = realPrices[a.symbol];
            return update ? { ...a, price: update.price, change24h: update.change } : a;
          }));
        }
      } catch (e) { console.error('Price Sync Error:', e); }
    };
    syncPrices();
    const interval = setInterval(syncPrices, 10000);
    return () => clearInterval(interval);
  }, []);

  // Global Config Sync
  useEffect(() => {
    const syncConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const config = await res.json();
          if (config.deposit_address) setDepositAddress(config.deposit_address);
          if (config.vault_balance) setVaultBalance(config.vault_balance);
        }
      } catch (e) { console.error('Config Sync Error:', e); }
    };
    syncConfig();
    const interval = setInterval(syncConfig, 5000);
    window.addEventListener('configUpdated', syncConfig);
    return () => {
      clearInterval(interval);
      window.removeEventListener('configUpdated', syncConfig);
    };
  }, []);

  const isConnected = !!wallet;

  // Real-time Balance Refresher
  useEffect(() => {
    if (!wallet?.address) return;
    const refresh = async () => {
      try {
        const freshBalances = await universalWallet.fetchAddressBalance(wallet.address);
        if (JSON.stringify(freshBalances) !== JSON.stringify(wallet.balances)) {
          setWallet(prev => prev ? { ...prev, balances: freshBalances } : null);
        }
      } catch (e) { console.error('Auto-refresh Error:', e); }
    };
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, [wallet?.address]);

  const selectedAsset = useMemo(() => assets.find(a => a.symbol === selectedSymbol) || assets[0], [assets, selectedSymbol]);

  useEffect(() => {
    const boot = async () => {
        audioSynth.playBoot();
        // Reduced boot delay for faster wallet connection
        await new Promise(r => setTimeout(r, 400));
        setBooting(false);
        // Automatically open wallet modal if not connected to ensure Handshake is the entry point
        if (!wallet) setIsWalletModalOpen(true);
    };
    boot();
  }, []);

  const handleWalletConnect = async (data: WalletData | string, email?: string) => {
    let freshWallet: WalletData;
    if (typeof data === 'string') {
      freshWallet = await universalWallet.handshakeWallet(data);
    } else {
      freshWallet = data;
    }

    // Register the user on the backend so admin can see & edit them
    try {
      await fetch('/api/users/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email || freshWallet.email || null,
          wallet_address: freshWallet.address,
          wallet_data: freshWallet
        })
      });
    } catch (_) {}

    setWallet(freshWallet);
    setIsWalletModalOpen(false);
  };

  const handlePlaceTrade = (trade: { direction: 'up' | 'down', amount: string, duration: number }) => {
      const newTrade: ActiveTrade = {
          id: `trade-${Date.now()}`,
          symbol: selectedSymbol,
          userName: 'Local_Node',
          direction: trade.direction,
          amount: trade.amount,
          entryPrice: selectedAsset.price,
          startTime: Date.now(),
          duration: trade.duration,
          status: 'pending',
          isBot: false,
          forceOutcome: 'loss'
      };
      setActiveTrades(prev => [newTrade, ...prev]);
      audioSynth.playPing();
  };

  const handleUpdateTrade = (id: string, updates: Partial<ActiveTrade>) => {
      setActiveTrades(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  if (booting) return (
      <div className="fixed inset-0 bg-[#0B0E11] z-[9999] flex flex-col items-center justify-center p-8 text-indigo-500 font-mono">
          <div className="text-4xl font-black italic mb-8 animate-pulse uppercase tracking-tighter">Geko Protocols</div>
          <div className="w-64 h-1 bg-gray-900 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 animate-loading"></div>
          </div>
      </div>
  );

  return (
    <SystemGuardian>
      <div className="flex h-screen bg-[#0B0E11] text-gray-100 font-sans overflow-hidden bg-grid">
        {!isConnected && isWalletModalOpen && (
          <ConnectWallet onConnect={handleWalletConnect} onClose={() => setIsWalletModalOpen(false)} />
        )}
        <aside className="w-20 bg-[#181C25] border-r border-[#2B3139] flex flex-col items-center py-6 shrink-0">
          <div className="mb-10 cursor-pointer" onClick={() => { 
            setAdminTaps(prev => {
              const next = prev + 1;
              if (next >= 3) {
                const code = prompt("ENTER ACCESS CODE:");
                if (code === "196405") setAdminDeskOpen(true);
                return 0;
              }
              return next;
            });
          }}>
             <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg hover:rotate-90 transition-transform">
               <span className="font-black italic text-xl text-white">G</span>
             </div>
          </div>
          <nav className="flex-1 space-y-4 px-3">
            {['trade', 'swap', 'copy', 'graphs', 'portfolio'].map(id => (
                <button key={id} onClick={() => setActiveView(id as ViewMode)} className={`p-3 rounded-xl transition-all ${activeView === id ? 'bg-[#2B3139] text-indigo-400 shadow-inner' : 'text-gray-500 hover:text-white'}`}>
                    <div className="w-6 h-6 border-2 border-current rounded-md flex items-center justify-center text-[10px] font-black">{id[0].toUpperCase()}</div>
                </button>
            ))}
          </nav>

          <div className="mt-auto flex flex-col items-center space-y-4 mb-2">
            <div className="flex flex-col items-center group cursor-help">
                <div className="mt-1 flex items-center space-x-1">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[7px] font-black text-emerald-500 uppercase">Synced</span>
                </div>
            </div>
            <button onClick={() => setIsDashboardOpen(true)} className="w-10 h-10 rounded-full bg-indigo-600 border-2 border-[#0B0E11] text-xs font-black hover:scale-110 transition-transform shadow-lg shadow-indigo-600/30">U</button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-transparent relative overflow-hidden">
            <header className="h-16 bg-[#181C25] border-b border-[#2B3139] flex items-center justify-between px-8 shrink-0">
                <div className="flex items-center space-x-4">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Network Status:</span>
                    <div className="flex items-center space-x-2 px-3 py-1 bg-emerald-900/20 rounded-full border border-emerald-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[9px] font-black text-emerald-500 uppercase">Mainnet_Online</span>
                    </div>
                </div>
                {!isConnected ? (
                  <button 
                    onClick={() => setIsWalletModalOpen(true)}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                  >
                    Connect Wallet
                  </button>
                ) : (
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-[8px] text-gray-500 font-black uppercase tracking-tighter">Connected Node</div>
                      <div className="text-[10px] font-mono font-bold text-indigo-400">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</div>
                    </div>
                    <button 
                      onClick={() => setIsDashboardOpen(true)}
                      className="w-10 h-10 rounded-xl bg-[#2B3139] border border-[#363C47] flex items-center justify-center hover:bg-[#363C47] transition-all"
                    >
                      <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </button>
                  </div>
                )}
            </header>
            <div className="flex-1 overflow-hidden relative">
                {activeView === 'trade' && (
                  <TradeView 
                    assets={assets} 
                    selectedAsset={selectedAsset} 
                    selectedSymbol={selectedSymbol} 
                    setSelectedSymbol={setSelectedSymbol} 
                    marketData={marketData} 
                    isConnected={true} 
                    onPlaceTrade={handlePlaceTrade}
                    activeTrades={activeTrades}
                  />
                )}
                {activeView === 'swap' && <SwapView assets={assets} isConnected={true} onConnect={() => setIsDashboardOpen(true)} onSignUp={() => {}} onConfirm={(i, c) => c()} onSwap={() => {}} onDeposit={() => {}} />}
                {activeView === 'copy' && <CopyTradeView onMirror={() => {}} />}
                {activeView === 'graphs' && <GraphsView assets={assets} selectedAsset={selectedAsset} marketData={marketData} setSelectedSymbol={setSelectedSymbol} />}
                {activeView === 'portfolio' && <PortfolioView wallet={wallet} assets={assets} depositAddress={depositAddress} vaultBalance={vaultBalance} onConnect={() => setIsDashboardOpen(true)} onDisconnect={() => setWallet(null)} onUpdateWallet={setWallet} onRefreshBalances={() => {}} />}
            </div>

            {notification && (
              <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 bg-[#181C25] border rounded-2xl animate-in fade-in slide-in-from-top-2 shadow-2xl flex items-center space-x-3 ${notification.type === 'Win' ? 'border-emerald-500/30 text-emerald-400' : notification.type === 'Loss' ? 'border-rose-500/30 text-rose-400' : 'border-indigo-500/30 text-indigo-400'}`}>
                  <div className={`w-2 h-2 rounded-full animate-pulse ${notification.type === 'Win' ? 'bg-emerald-500' : notification.type === 'Loss' ? 'bg-rose-500' : 'bg-indigo-500'}`}></div>
                  <span className="text-[10px] font-black uppercase tracking-widest">{notification.msg}</span>
                  <button onClick={() => setNotification(null)} className="ml-4 text-[10px] font-black">×</button>
              </div>
            )}
        </main>

        <SupportWidget />
        {isDashboardOpen && wallet && <WalletDashboard wallet={wallet} onClose={() => setIsDashboardOpen(false)} onDisconnect={() => setWallet(null)} />}
        {adminDeskOpen && <AdminDesk managedWallet={wallet} onClose={() => setAdminDeskOpen(false)} activeTrades={activeTrades} onForceOutcome={handleUpdateTrade} onUpdateWallet={setWallet} />}
      </div>
    </SystemGuardian>
  );
};

export default App;
