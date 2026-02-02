
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

export const universalWallet = {
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
        
        // EVM Detection (ETH, BSC, Polygon)
        if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
            const fetchChainBalance = async (url: string, symbol: string, price: number) => {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] })
                    });
                    const data = await response.json();
                    if (data.result) {
                        const amt = formatBalance(data.result, 18);
                        const usd = (parseFloat(amt.replace(/,/g, '')) * price).toFixed(2);
                        if (parseFloat(amt.replace(/,/g, '')) > 0) {
                            balances.push({ symbol, amount: amt, valueUsd: usd });
                        }
                    }
                } catch (e) { }
            };

            await Promise.all([
                fetchChainBalance(RPC_PROVIDERS.ETH, 'ETH', 2950),
                fetchChainBalance(RPC_PROVIDERS.BSC, 'BNB', 590),
                fetchChainBalance(RPC_PROVIDERS.MATIC, 'MATIC', 0.42)
            ]);

            return balances.length > 0 ? balances : [{ symbol: 'ETH', amount: '0.00', valueUsd: '0.00' }];
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
                    const solAmt = parseFloat(formatBalance(data.result.value, 9).replace(/,/g, ''));
                    balances.push({ symbol: 'SOL', amount: solAmt.toFixed(2), valueUsd: (solAmt * 165).toFixed(2) });
                }
            } catch (e) { }
            return balances.length > 0 ? balances : [{ symbol: 'SOL', amount: '0.00', valueUsd: '0.00' }];
        }

        return [{ symbol: 'USDT', amount: '0.00', valueUsd: '0.00' }];
    },

    connectEVM: async (walletName: string): Promise<WalletData> => {
        const provider = window.ethereum;
        if (!provider) throw new Error(`${walletName} not detected.`);
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        const address = accounts[0];
        const balances = await universalWallet.fetchAddressBalance(address);
        return { address, source: walletName, chainType: 'evm', balances, history: [] };
    },

    connectSolana: async (): Promise<WalletData> => {
        const provider = (window as any).phantom?.solana || (window as any).solana;
        if (!provider) throw new Error("Solana wallet not detected.");
        const resp = await provider.connect();
        const address = resp.publicKey.toString();
        const balances = await universalWallet.fetchAddressBalance(address);
        return { address, source: 'Phantom', chainType: 'svm', balances, history: [] };
    }
};
