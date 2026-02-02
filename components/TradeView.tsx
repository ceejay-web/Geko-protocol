
import React, { useState } from 'react';
import { AssetInfo, MarketData, ActiveTrade } from '../types';
import MarketChart from './MarketChart';
import GeminiAdvisor from './GeminiAdvisor';

interface TradeViewProps {
  assets: AssetInfo[];
  selectedAsset: AssetInfo;
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;
  marketData: MarketData[];
  isConnected: boolean;
  onPlaceTrade: (trade: { direction: 'up' | 'down', amount: string, duration: number }) => void;
  activeTrades: ActiveTrade[];
}

const TradeView: React.FC<TradeViewProps> = ({ 
  assets, 
  selectedAsset, 
  selectedSymbol, 
  setSelectedSymbol, 
  marketData,
  isConnected,
  onPlaceTrade,
  activeTrades
}) => {
  const [showIndicators, setShowIndicators] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false);
  
  // Execution Form State
  const [amount, setAmount] = useState('100');
  const [duration, setDuration] = useState(60);
  const [leverage, setLeverage] = useState(20);

  const userActiveTrades = activeTrades.filter(t => t.userName === 'Local_Node' && t.status === 'pending');

  return (
    <div className="flex flex-col h-full bg-[#0B0E11] text-gray-300 font-mono select-none overflow-hidden relative">
      {/* HUD Header */}
      <div className="h-16 border-b border-[#2B3139] bg-[#181C25] flex items-center px-6 shrink-0 z-30 justify-between">
        <div className="flex items-center space-x-8">
            <button 
                onClick={() => setIsAssetSelectorOpen(true)}
                className="flex flex-col text-left group hover:bg-[#2B3139] p-2 rounded-xl transition-all border border-transparent hover:border-indigo-500/30"
            >
                <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest flex items-center">
                    Institutional Pair
                    <svg className="w-3 h-3 ml-1 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                </span>
                <span className="text-gray-100 font-black text-lg italic tracking-tighter group-hover:text-indigo-400">{selectedSymbol}/USDT</span>
            </button>
            <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Oracle Index</span>
                <span className={`text-lg font-black tabular-nums ${selectedAsset.price > 0 ? (selectedAsset.change24h >= 0 ? 'text-emerald-500' : 'text-rose-500') : 'text-gray-600'}`}>
                    ${selectedAsset.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
            </div>
            <div className="hidden lg:flex items-center space-x-3 bg-[#0B0E11] px-4 py-2 rounded-xl border border-[#2B3139]">
                <button onClick={() => setShowIndicators(!showIndicators)} className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg transition-all ${showIndicators ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                    TA Indicators
                </button>
                <button onClick={() => setShowAI(!showAI)} className={`text-[10px] uppercase font-black px-3 py-1 rounded-lg flex items-center space-x-2 transition-all ${showAI ? 'bg-indigo-900/30 text-indigo-400 border border-indigo-500/30' : 'text-gray-500 hover:text-gray-300'}`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <span>Neural Analysis</span>
                </button>
            </div>
        </div>
        
        <div className="flex items-center space-x-4 shrink-0">
          <div className="flex items-center space-x-3 bg-indigo-900/10 px-5 py-2 rounded-xl border border-indigo-500/20 group cursor-default relative">
             <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
             <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Protocol Handshake: Secured</span>
             
             {/* Tooltip detail for the "Sync" */}
             <div className="absolute top-full right-0 mt-2 w-48 bg-[#1E2329] border border-[#2B3139] p-3 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl">
                <div className="text-[8px] text-gray-500 font-black uppercase mb-1">Telemetry Origin</div>
                <div className="text-[9px] text-indigo-400 font-mono">github.com/ceejay-web/Geko---protocol</div>
             </div>
          </div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex bg-[#0B0E11]">
        {/* Graph Area */}
        <div className="flex-1 relative h-full flex flex-col">
            <div className="flex-1 relative">
                <MarketChart 
                    data={marketData} 
                    symbol={selectedSymbol} 
                    showIndicators={showIndicators} 
                />
            </div>
            
            {/* Minimalist Positions View (Strip at bottom of chart) */}
            {userActiveTrades.length > 0 && (
                <div className="h-16 bg-[#181C25]/80 backdrop-blur-md border-t border-[#2B3139] flex items-center px-6 space-x-4 overflow-x-auto no-scrollbar shrink-0 z-20">
                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest shrink-0">Live Orders:</span>
                    {userActiveTrades.map(t => (
                        <div key={t.id} className="flex items-center space-x-4 bg-[#0B0E11] px-5 py-2.5 rounded-2xl border border-[#2B3139] shrink-0 animate-in slide-in-from-bottom-2">
                            <span className={`text-[10px] font-black uppercase ${t.direction === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {t.direction === 'up' ? 'Long' : 'Short'} ${t.amount}
                            </span>
                            <div className="h-4 w-px bg-gray-800"></div>
                            <span className="text-[10px] font-mono font-bold text-gray-500">
                                {Math.max(0, t.duration - Math.floor((Date.now() - t.startTime)/1000))}s remaining
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Execution Control Sidebar */}
        <div className="w-72 bg-[#181C25] border-l border-[#2B3139] shrink-0 flex flex-col z-30 shadow-2xl relative">
            <div className="p-6 space-y-8 flex-1 flex flex-col justify-center">
                <div className="space-y-6">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Trade Size (USDT)</label>
                            <span className="text-[9px] text-indigo-400 font-black">Max: $25.0K</span>
                        </div>
                        <input 
                            type="number" 
                            value={amount} 
                            onChange={(e) => setAmount(e.target.value)} 
                            className="w-full bg-[#0B0E11] border border-[#2B3139] rounded-2xl p-4 text-sm text-gray-100 outline-none font-mono focus:border-indigo-500 transition-all shadow-inner" 
                        />
                    </div>
                    
                    <div className="space-y-3">
                        <div className="flex justify-between text-[9px] text-gray-500 font-black uppercase tracking-widest px-1">
                            <span>Leverage Multiplier</span>
                            <span className="text-indigo-400">{leverage}x</span>
                        </div>
                        <input type="range" min="1" max="100" value={leverage} onChange={(e) => setLeverage(parseInt(e.target.value))} className="w-full h-1.5 bg-[#2B3139] rounded-full appearance-none cursor-pointer accent-indigo-500" />
                        <div className="flex justify-between text-[7px] text-gray-600 font-black uppercase">
                            <span>1x</span>
                            <span>50x</span>
                            <span>100x</span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[9px] text-gray-500 font-black uppercase tracking-widest ml-1">Settlement Duration</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[30, 60, 120].map(s => (
                                <button key={s} onClick={() => setDuration(s)} className={`py-3 text-[10px] font-black rounded-xl border transition-all ${duration === s ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'border-[#2B3139] text-gray-500 hover:border-gray-600'}`}>
                                    {s}s
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col space-y-4 pt-6">
                    <button 
                        onClick={() => onPlaceTrade({ direction: 'up', amount, duration })}
                        className="group relative w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[24px] font-black uppercase text-xs tracking-[0.2em] shadow-xl transition-all active:scale-95 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                        <span className="relative z-10">BUY / LONG</span>
                    </button>
                    <button 
                        onClick={() => onPlaceTrade({ direction: 'down', amount, duration })}
                        className="group relative w-full py-5 bg-rose-600 hover:bg-rose-500 text-white rounded-[24px] font-black uppercase text-xs tracking-[0.2em] shadow-xl transition-all active:scale-95 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                        <span className="relative z-10">SELL / SHORT</span>
                    </button>
                </div>
            </div>

            <div className="p-6 bg-[#0B0E11] border-t border-[#2B3139]">
                <div className="flex items-center justify-between text-[8px] text-gray-600 font-black uppercase tracking-widest">
                    <span>Maker Fee: 0%</span>
                    <span>Geko Mainnet Execution</span>
                </div>
            </div>
        </div>

        {/* Dynamic AI Sidebar Overlay */}
        {showAI && (
            <div className="w-96 border-l border-[#2B3139] bg-[#181C25]/95 backdrop-blur-md z-40 animate-in slide-in-from-right absolute right-0 top-0 bottom-0 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">
                <GeminiAdvisor 
                    symbol={selectedSymbol} 
                    data={marketData} 
                />
                <button 
                    onClick={() => setShowAI(false)}
                    className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        )}
      </div>

      {/* Asset Selector Modal */}
      {isAssetSelectorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setIsAssetSelectorOpen(false)} />
          <div className="relative w-full max-w-2xl bg-[#181C25] border border-[#2B3139] rounded-[48px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-8 border-b border-[#2B3139] bg-[#1E2329] flex justify-between items-center">
                <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Market Index</h2>
                <button onClick={() => setIsAssetSelectorOpen(false)} className="p-2 hover:bg-[#2B3139] rounded-full transition-colors">
                    <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4 custom-scrollbar">
                {assets.map((asset) => (
                    <button 
                        key={asset.symbol}
                        onClick={() => {
                            setSelectedSymbol(asset.symbol);
                            setIsAssetSelectorOpen(false);
                        }}
                        className={`flex items-center justify-between p-6 rounded-3xl border transition-all hover:scale-[1.02] ${
                            selectedSymbol === asset.symbol 
                            ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10' 
                            : 'bg-[#0B0E11] border-[#2B3139] hover:border-gray-600'
                        }`}
                    >
                        <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-[#1E2329] rounded-2xl flex items-center justify-center font-black text-xs text-gray-400 border border-[#363C45]">
                                {asset.symbol[0]}
                            </div>
                            <div className="text-left">
                                <div className="text-lg font-black text-gray-100">{asset.symbol}/USDT</div>
                                <div className="text-[10px] text-gray-500 uppercase font-black">{asset.name}</div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-bold text-gray-100 font-mono">${asset.price.toLocaleString()}</div>
                            <div className={`text-[10px] font-black ${asset.change24h >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {asset.change24h > 0 ? '+' : ''}{asset.change24h}%
                            </div>
                        </div>
                    </button>
                ))}
            </div>
            <div className="p-6 bg-[#0B0E11] border-t border-[#2B3139] text-center">
                <span className="text-[10px] text-gray-600 font-black uppercase tracking-[0.4em]">Establishing low-latency protocol link...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeView;
