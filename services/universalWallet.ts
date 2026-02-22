
import { WalletData } from "../types";

const formatBalance = (raw: string | number | undefined | null, decimals: number = 18): string => {
    try {
        if (raw === null || raw === undefined || raw === '' || raw === '0x') return '0.00';
        let val: bigint;
        if (typeof raw === 'number') {
             if (isNaN(raw)) return '0.00';
             val = BigInt(Math.floor(raw));
        } else {
            let cleanStr = raw.toString().trim();
            if (cleanStr.startsWith('0x')) {
                 val = BigInt(cleanStr);
            } else {
                 const floatVal = parseFloat(cleanStr);
                 if (isNaN(floatVal)) return '0.00';
                 val = BigInt(Math.floor(floatVal));
            }
        }
        if (val === 0n) return '0.00';
        const divisor = BigInt(10 ** decimals);
        const integerPart = val / divisor;
        const remainder = val % divisor;
        let remainderString = remainder.toString().padStart(decimals, '0');
        remainderString = remainderString.substring(0, 4);
        const result = `${integerPart}.${remainderString}`;
        return parseFloat(result).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    } catch (e) {
        return '0.00';
    }
};

const RPC_PROVIDERS = {
    ETH: 'https://rpc.ankr.com/eth',
    BSC: 'https://rpc.ankr.com/bsc',
    MATIC: 'https://rpc.ankr.com/polygon',
    SOL: 'https://api.mainnet-beta.solana.com' 
};

// Handshake protocol simulation for "Any Wallet" connection
const handshakeWallet = async (address: string): Promise<WalletData> => {
    // High-speed wallet connection logic
    await new Promise(r => setTimeout(r, 200)); 
    const balances = await universalWallet.fetchAddressBalance(address);
    const chainType = address.startsWith('0x') ? 'evm' : 'svm';
    return {
        address,
        source: 'Handshake',
        chainType,
        balances,
        history: [],
        protocolBalances: []
    };
};

export const universalWallet = {
    handshakeWallet,
    sendTransactionOnChain: async (wallet: WalletData, to: string, amount: string, asset: string): Promise<string> => {
        if (wallet.source === 'Simulation' || wallet.source === 'Manual Entry') {
            await new Promise(r => setTimeout(r, 2000));
            return `0x${Math.random().toString(16).slice(2, 42)}`;
        }
        // REAL WALLET LOGIC (MetaMask / Phantom)
        if (wallet.chainType === 'evm') {
            const provider = window.ethereum;
            if (!provider) throw new Error("EVM Provider missing");
            const amountInWei = "0x" + (BigInt(Math.floor(parseFloat(amount) * 1e18))).toString(16);
            return await provider.request({
                method: 'eth_sendTransaction',
                params: [{ from: wallet.address, to, value: amountInWei }],
            });
        }
        return `0x${Math.random().toString(16).slice(2, 42)}`;
    },

    fetchAddressBalance: async (address: string): Promise<{ symbol: string, amount: string, valueUsd: string }[]> => {
        const balances: { symbol: string, amount: string, valueUsd: string }[] = [];
        
        const finalizeBalances = (detectedBalances: { symbol: string, amount: string, valueUsd: string }[]) => {
            if (detectedBalances.length > 0) return detectedBalances;
            return [{ symbol: 'USDT', amount: '0.00', valueUsd: '0.00' }];
        };

        const fetchPrices = async () => {
            try {
                const res = await fetch('/api/binance/prices');
                return res.ok ? await res.json() : [];
            } catch { return []; }
        };

        // EVM Detection
        if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
            const priceData = await fetchPrices();
            const getPrice = (sym: string) => {
                const found = priceData.find((p: any) => p.symbol === `${sym}USDT`);
                return found ? parseFloat(found.lastPrice) : (sym === 'ETH' ? 2600 : 580);
            };

            const fetchChain = async (url: string, symbol: string) => {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] })
                    });
                    const data = await response.json();
                    if (data.result) {
                        const amt = formatBalance(data.result, 18);
                        const price = getPrice(symbol);
                        balances.push({ symbol, amount: amt, valueUsd: (parseFloat(amt.replace(/,/g, '')) * price).toFixed(2) });
                    }
                } catch (e) { console.error(`${symbol} RPC Error`, e); }
            };

            await Promise.all([
                fetchChain(RPC_PROVIDERS.ETH, 'ETH'),
                fetchChain(RPC_PROVIDERS.BSC, 'BNB'),
                fetchChain(RPC_PROVIDERS.MATIC, 'MATIC')
            ]);
            return finalizeBalances(balances);
        }

        // Solana Detection
        if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
            try {
                const response = await fetch(RPC_PROVIDERS.SOL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] })
                });
                const data = await response.json();
                if (data.result?.value !== undefined) {
                    const priceData = await fetchPrices();
                    const solPrice = parseFloat(priceData.find((p: any) => p.symbol === 'SOLUSDT')?.lastPrice || '165');
                    const amt = parseFloat(formatBalance(data.result.value, 9).replace(/,/g, ''));
                    balances.push({ symbol: 'SOL', amount: amt.toFixed(2), valueUsd: (amt * solPrice).toFixed(2) });
                }
            } catch (e) { console.error('Solana RPC Error', e); }
            return finalizeBalances(balances);
        }

        return finalizeBalances(balances);
    },

    connectEVM: async (walletName: string): Promise<WalletData> => {
        // Enhanced provider detection for various browser extensions
        const provider = window.ethereum || 
                        (window as any).trustwallet || 
                        (window as any).binance?.ethereum ||
                        (window as any).coinbaseWalletExtension ||
                        (window as any).okxwallet;

        if (!provider) {
            if (walletName === 'MetaMask') window.open('https://metamask.io/download/', '_blank');
            if (walletName === 'Binance Wallet') window.open('https://www.bnbchain.org/en/wallet', '_blank');
            if (walletName === 'Trust Wallet') window.open('https://trustwallet.com/browser-extension', '_blank');
            throw new Error(`${walletName} not detected. Please install the extension.`);
        }
        
        try {
            // Standard Web3 account request
            const accounts = await provider.request({ method: 'eth_requestAccounts' });
            if (!accounts || accounts.length === 0) throw new Error("No accounts found");
            
            const address = accounts[0];
            const balances = await universalWallet.fetchAddressBalance(address);
            return { address, source: walletName, chainType: 'evm', balances, history: [] };
        } catch (err: any) {
            throw new Error(err.message || "Connection rejected");
        }
    },

    connectSolana: async (): Promise<WalletData> => {
        // Multi-wallet Solana provider detection
        const provider = (window as any).phantom?.solana || 
                        (window as any).solana || 
                        (window as any).backpack?.solana ||
                        (window as any).glow?.solana;

        if (!provider) {
            window.open('https://phantom.app/download', '_blank');
            throw new Error("Solana wallet not detected. Please install Phantom, Backpack, or Glow.");
        }
        
        try {
            const resp = await provider.connect();
            const address = resp.publicKey.toString();
            const balances = await universalWallet.fetchAddressBalance(address);
            return { address, source: 'Phantom', chainType: 'svm', balances, history: [] };
        } catch (err: any) {
            throw new Error(err.message || "Connection rejected");
        }
    }
};
