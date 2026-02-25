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
// ✅ Port fix for Replit/local
const port = process.env.PORT || 5000;

// Global Configuration Store (In-memory for demo, should be DB in prod)
let globalConfig = {
  vault_balance: "25,000.00",
  deposit_address: "0xcDEC8d41f2acCCA50064F24A089fC3F52Fadedd0"
};

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

app.get('/api/config', (req, res) => {
  res.json({
    vault_balance: globalConfig.vault_balance || "25,000.00",
    deposit_address: globalConfig.deposit_address || "0xcDEC8d41f2acCCA50064F24A089fC3F52Fadedd0"
  });
});

app.post('/api/admin/config', (req, res) => {
  const { vault_balance, deposit_address } = req.body;
  if (vault_balance) globalConfig.vault_balance = vault_balance;
  if (deposit_address) globalConfig.deposit_address = deposit_address;
  res.json({ success: true, config: globalConfig });
});

app.get('/api/binance/prices', async (req, res) => {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","MATICUSDT"]');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Standard SPA catch-all for Express 5
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'index.html'), (err2) => {
        if (err2) {
          res.status(500).send("Critical System Error: index.html not found.");
        }
      });
    }
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Unified Server running on port ${port}`);
});

