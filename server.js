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
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

// ... (keep all your routes exactly as before)

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get(/(.*)/, (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
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

