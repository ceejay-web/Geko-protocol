
import React from 'react';
import { AssetInfo, MarketData } from '../types';
import MarketChart from './MarketChart';

interface GraphsViewProps {
  assets: AssetInfo[];
  selectedAsset: AssetInfo;
  marketData: MarketData[];
  setSelectedSymbol: (symbol: string) => void;
}

const GraphsView: React.FC<GraphsViewProps> = ({ assets, selectedAsset, marketData, setSelectedSymbol }) => {
  return (
    <div className="h-full flex flex-col p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Market Visualizer</h1>
          <p className="text-gray-500 text-sm">Deep-dive technical analysis and correlation matrix.</p>
        </div>
        <div className="flex space-x-2">
          {assets.slice(0, 4).map(asset => (
            <button 
              key={asset.symbol}
              onClick={() => setSelectedSymbol(asset.symbol)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                selectedAsset.symbol === asset.symbol 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {asset.symbol}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 glass rounded-2xl border border-gray-800 p-8 flex flex-col">
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-center space-x-6">
             <div>
               <div className="text-xs text-gray-500 uppercase font-bold mb-1">Current Price</div>
               <div className="text-4xl font-mono font-bold">${selectedAsset.price.toLocaleString()}</div>
             </div>
             <div className="h-10 w-px bg-gray-800"></div>
             <div>
               <div className="text-xs text-gray-500 uppercase font-bold mb-1">24h Change</div>
               <div className={`text-2xl font-mono font-bold ${selectedAsset.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                 {selectedAsset.change24h >= 0 ? '+' : ''}{selectedAsset.change24h}%
               </div>
             </div>
          </div>
          <div className="flex space-x-2">
            {['CANDLES', 'AREA', 'LINE', 'HLC'].map(type => (
              <button key={type} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border border-gray-800 ${type === 'AREA' ? 'bg-gray-800 text-white' : 'text-gray-500'}`}>
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 w-full min-h-[500px]">
           <MarketChart data={marketData} symbol={selectedAsset.symbol} showVolume={false} />
        </div>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
           {[
             { label: 'RSI (14)', value: '58.4', status: 'Neutral' },
             { label: 'MACD', value: '142.12', status: 'Bullish' },
             { label: 'Bollinger', value: 'Upper', status: 'Warning' },
             { label: 'VWAP', value: '$64,120', status: 'Support' }
           ].map(stat => (
             <div key={stat.label} className="bg-gray-900/40 border border-gray-800 p-4 rounded-xl">
               <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">{stat.label}</div>
               <div className="flex justify-between items-end">
                 <div className="text-lg font-mono font-bold">{stat.value}</div>
                 <div className="text-[10px] font-bold text-indigo-400">{stat.status}</div>
               </div>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
};

export default GraphsView;
