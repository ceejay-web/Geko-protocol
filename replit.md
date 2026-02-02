# Geko Protocols

## Overview
Geko Protocols is an institutional digital asset terminal built with React and Vite. It provides real-time trading, aggregated liquidity, and AI-driven settlement features.

## Project Structure
- `App.tsx` - Main application component
- `index.tsx` - Application entry point
- `index.html` - HTML template
- `components/` - React components
- `services/` - Service modules for API integrations
- `types.ts` - TypeScript type definitions
- `vite.config.ts` - Vite configuration

## Technologies
- React 18
- TypeScript
- Vite 5
- TailwindCSS (via CDN)
- Firebase (for authentication/database)
- Lightweight Charts (for market data visualization)

## Development
The dev server runs on port 5000 with the command `npm run dev`.

## Recent Changes
- Configured for Replit environment (port 5000, allowed hosts)
- Added missing qrcode dependency
- Created index.css file

## Notes
- Some external API calls (like Binance) may show CORS errors in development - this is expected for client-side API calls
