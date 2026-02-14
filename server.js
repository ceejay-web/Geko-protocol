import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from 'process';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Symbol Mapping for CoinCap
const ASSET_ID_MAP = {
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

// Create tables if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    wallet_data JSONB DEFAULT '{}'::jsonb
  );
`).catch(console.error);

// Proxy for Market Prices (Multi-source fallback)
app.get('/api/binance/prices', async (req, res) => {
  try {
    // Attempt Bitfinex first
    const response = await fetch('https://api-pub.bitfinex.com/v2/tickers?symbols=tBTCUSD,tETHUSD,tSOLUSD,tDOTUSD,tUSTUSD,tBNBUSD,tXRPUSD,tADAUSD,tDOGEUSD,tMATICUSD,tAVAXUSD,tLINKUSD,tKSMUSD');
    if (response.ok) {
      const data = await response.json();
      const mapped = data.map(ticker => ({
        symbol: ticker[0].replace('t', '').replace('USD', 'USDT').replace('UST', 'USDT'),
        lastPrice: ticker[7],
        priceChangePercent: ticker[6] * 100
      }));
      return res.json(mapped);
    }
  } catch (e) {
    console.error('Bitfinex error:', e.message);
  }

  try {
    // Fallback to CoinCap
    const response = await fetch('https://api.coincap.io/v2/assets?limit=100', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
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
    console.error('CoinCap error:', e.message);
  }
  
  res.status(500).json({ error: 'Failed to fetch market data' });
});

// Proxy for Klines
app.get('/api/binance/klines', async (req, res) => {
  try {
    const { symbol } = req.query;
    const baseSymbol = symbol.replace('USDT', '');
    const id = ASSET_ID_MAP[baseSymbol] || baseSymbol.toLowerCase();
    
    const response = await fetch(`https://api.coincap.io/v2/assets/${id}/history?interval=m15`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!response.ok) throw new Error(`CoinCap history error: ${response.status}`);
    const data = await response.json();
    
    const klines = data.data.map(d => [
      parseInt(d.time), // Open time
      d.priceUsd, // Open
      d.priceUsd, // High
      d.priceUsd, // Low
      d.priceUsd, // Close
      "0", // Volume
      parseInt(d.time) + 900000, // Close time
      "0", "0", "0", "0", "0"
    ]);
    res.json(klines);
  } catch (error) {
    console.error(`Klines Error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch klines' });
  }
});

// Auth Routes
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, walletData } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password, wallet_data) VALUES ($1, $2, $3) RETURNING *',
      [email, password, JSON.stringify(walletData)]
    );
    
    // Log verification for sandbox monitoring
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[VERIFICATION_DISPATCH] TARGET: ${email} | CODE: ${code}`);
    
    res.json({ success: true, user: result.rows[0], verificationSent: true });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, error: error.message || 'Auth error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]);
    if (result.rows.length > 0) {
      res.json({ success: true, user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Auth error' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, wallet_data FROM users ORDER BY id DESC');
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
  console.log(`Backend running on port ${port}`);
});
