import { MarketData } from "../types";

const BINANCE_API = '/api/binance';

// Map App symbols to CoinCap IDs for fallback
const ASSET_ID_MAP: Record<string, string> = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'DOT': 'polkadot',
    'USDT': 'tether',
    'BNB': 'binance-coin',
    'XRP': 'xrp',
    'ADA': 'cardano',
    'DOGE': 'dogecoin',
    'MATIC': 'polygon',
    'AVAX': 'avalanche',
    'LINK': 'chainlink',
    'KSM': 'kusama'
};

// Base prices for simulation fallback
const BASE_PRICES: Record<string, number> = {
    'BTC': 82929.94,
    'ETH': 2950,
    'SOL': 168,
    'DOT': 6.80,
    'KSM': 41.5,
    'USDT': 1.00,
    'BNB': 595,
    'XRP': 0.89,
    'ADA': 0.52,
    'AVAX': 31.8,
    'LINK': 15.2,
    'MATIC': 0.38
};

const generateMockCandles = (symbol: string, count: number = 100): MarketData[] => {
    const now = Math.floor(Date.now() / 1000);
    const candles: MarketData[] = [];
    let price = BASE_PRICES[symbol] || 100;
    
    // Generate backwards
    for (let i = count; i >= 0; i--) {
        const time = now - (i * 15 * 60);
        const volatility = price * 0.008; 
        const change = (Math.random() - 0.5) * volatility;
        const close = price + change;
        const open = price;
        const high = Math.max(open, close) + Math.random() * volatility * 0.3;
        const low = Math.min(open, close) - Math.random() * volatility * 0.3;
        const volume = Math.random() * 50000 + 10000;
        candles.push({ time, open, high, low, close, volume });
        price = close;
    }
    return candles;
};

export async function fetchRealPrices(): Promise<Partial<Record<string, { price: number, change: number }>>> {
  try {
    // Try Binance Proxy first for most accurate data
    const response = await fetch('/api/binance/prices');
    if (response.ok) {
        const data = await response.json();
        const results: Record<string, { price: number, change: number }> = {};
        data.forEach((item: any) => {
            if (item.symbol.endsWith('USDT')) {
                const symbol = item.symbol.replace('USDT', '');
                results[symbol] = {
                    price: parseFloat(item.lastPrice),
                    change: parseFloat(item.priceChangePercent)
                };
            }
        });
        return results;
    }
  } catch (e) {}

  try {
    const response = await fetch('https://api.coincap.io/v2/assets?limit=50');
    if (!response.ok) return {};
    const json = await response.json();
    const results: Record<string, { price: number, change: number }> = {};
    if (json && json.data) {
        json.data.forEach((asset: any) => {
            const symbol = asset.symbol.toUpperCase();
            results[symbol] = {
                price: parseFloat(asset.priceUsd),
                change: parseFloat(asset.changePercent24Hr)
            };
        });
    }
    return results;
  } catch (error: any) {
    return {};
  }
}

export async function fetchCandles(symbol: string): Promise<MarketData[]> {
    try {
        const pair = `${symbol}USDT`;
        const response = await fetch(`${BINANCE_API}/klines?symbol=${pair}&interval=15m&limit=100`);
        if (response.ok) {
            const data = await response.json();
            return data.map((d: any) => ({
                time: d[0] / 1000,
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5])
            }));
        }
    } catch (e) {
        // Fallback to simulation
    }

    try {
        const id = ASSET_ID_MAP[symbol] || symbol.toLowerCase();
        const response = await fetch(`https://api.coincap.io/v2/assets/${id}/history?interval=m15`);
        if (response.ok) {
            const json = await response.json();
            if (json.data && json.data.length > 0) {
                return json.data.map((d: any) => {
                    const price = parseFloat(d.priceUsd);
                    return {
                        time: d.time / 1000,
                        open: price,
                        high: price * 1.002,
                        low: price * 0.998,
                        close: price,
                        volume: Math.random() * 100000 
                    };
                });
            }
        }
    } catch (err) {}

    return generateMockCandles(symbol);
}
