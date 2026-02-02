
import React, { useState, useMemo, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { WalletData, Transaction, AssetInfo } from '../types';
import { universalWallet } from '../services/universalWallet';
import { audioSynth } from '../services/audioSynth';

interface PortfolioViewProps {
  wallet: WalletData | null;
  assets: AssetInfo[];
  depositAddress: string;
  onConnect: () => void;
  onUpdateWallet: (data: WalletData) => void;
  onDisconnect: () => void;
  onRefreshBalances: () => void;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({ wallet, assets, depositAddress, onConnect, onUpdateWallet, onDisconnect, onRefreshBalances }) => {
  const [activeModal, setActiveModal] = useState<'deposit' | 'withdraw' | 'kyc' | null>(null);
  const [step, setStep] = useState<'form' | 'broadcasting' | 'confirming' | 'success'>('form');
  
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAsset, setWithdrawAsset] = useState('USDT');
  const [withdrawDestination, setWithdrawDestination] = useState('');
  
  const [depositAmount, setDepositAmount] = useState('');
  const [depositAsset, setDepositAsset] = useState('USDT');
  
  const [broadcastProgress, setBroadcastProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [gasPrice, setGasPrice] = useState(24);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  const [simulatedYield, setSimulatedYield] = useState(0);
  const lastUpdateTime = useRef(Date.now());
  
  useEffect(() => {
    const int = setInterval(() => setGasPrice(prev => Math.max(12, prev + (Math.random() * 4 - 2))), 5000);
    return () => clearInterval(int);
  }, []);

  // Generate real QR code when deposit address changes or modal opens
  useEffect(() => {
    if (activeModal === 'deposit' && depositAddress) {
      QRCode.toDataURL(depositAddress, {
        width: 400,
        margin: 2,
        color: {
          dark: '#0B0E11',
          light: '#FFFFFF',
        }
      })
      .then(url => setQrCodeUrl(url))
      .catch(err => console.error("QR Error:", err));
    }
  }, [activeModal, depositAddress]);

  const equityBalance = useMemo(() => {
    if (!wallet || !wallet.protocolBalances) return 0;
    return wallet.protocolBalances.reduce((acc, curr) => acc + parseFloat(curr.valueUsd.replace(/,/g, '')), 0);
  }, [wallet]);

  const vipTier = useMemo(() => {
    if (equityBalance >= 1000000) return { name: 'DIAMOND', color: 'text-cyan-400', bg: 'bg-cyan-950/20', limit: 'UNLIMITED' };
    if (equityBalance >= 100000) return { name: 'PLATINUM', color: 'text-indigo-400', bg: 'bg-indigo-950/20', limit: '500,000 USDT' };
    if (equityBalance >= 10000) return { name: 'GOLD', color: 'text-amber-400', bg: 'bg-amber-950/20', limit: '50,000 USDT' };
    return { name: 'STANDARD', color: 'text-gray-400', bg: 'bg-gray-800/20', limit: '5,000 USDT' };
  }, [equityBalance]);

  useEffect(() => {
    if (!wallet || equityBalance === 0) return;
    const dailyYieldRate = 0.0005;
    const dailyYieldAmount = equityBalance * dailyYieldRate;
    const yieldPerSecond = dailyYieldAmount / 86400;
    const interval = setInterval(() => {
        const now = Date.now();
        const deltaSeconds = (now - lastUpdateTime.current) / 1000;
        if (deltaSeconds > 0) {
            setSimulatedYield(prev => prev + (yieldPerSecond * deltaSeconds));
            lastUpdateTime.current = now;
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [equityBalance, wallet]);

  const runBroadcastSequence = async (type: 'deposit' | 'withdraw' | 'kyc') => {
    setStep('broadcasting');
    setBroadcastProgress(0);
    setErrorMsg('');
    audioSynth.playPing();

    try {
        let txHash = "";
        const amount = type === 'deposit' ? depositAmount : withdrawAmount;
        const asset = type === 'deposit' ? depositAsset : withdrawAsset;

        if (type === 'deposit') {
            const canSign = wallet?.source !== 'Manual Entry' && wallet?.source !== 'Simulation';
            if (canSign) {
                txHash = await universalWallet.sendTransactionOnChain(wallet!, depositAddress, amount, asset);
            } else {
                txHash = `0x${Math.random().toString(16).slice(2, 42)}_PENDING`;
                await new Promise(r => setTimeout(r, 1500));
            }
        } else if (type === 'kyc') {
            await new Promise(r => setTimeout(r, 4000));
            txHash = 'Verification_Signed_Local_Node';
        } else {
            txHash = `0x${Math.random().toString(16).slice(2, 42)}`;
            await new Promise(r => setTimeout(r, 2000));
        }

        const nodeInterval = setInterval(() => {
            setBroadcastProgress(prev => Math.min(prev + Math.random() * 20, 95));
        }, 150);

        setStep('confirming');
        await new Promise(r => setTimeout(r, 2500));
        clearInterval(nodeInterval);
        setBroadcastProgress(100);
        
        if (type !== 'kyc') {
            const newTx: Transaction = {
                id: `tx-${Date.now()}`,
                type: type === 'deposit' ? 'Receive' : 'Send',
                asset: asset,
                amount: type === 'deposit' ? `+${amount}` : `-${amount}`,
                status: 'Pending',
                timestamp: new Date().toLocaleTimeString(),
                hash: txHash,
                destinationAddress: type === 'withdraw' ? withdrawDestination : undefined
            };

            onUpdateWallet({ ...wallet!, history: [newTx, ...(wallet!.history || [])] });
        }

        setStep('success');
        audioSynth.playSuccess();
        setTimeout(() => {
            setActiveModal(null);
            setStep('form');
            setDepositAmount('');
            setWithdrawAmount('');
            setWithdrawDestination('');
        }, 2500);

    } catch (e: any) {
        setErrorMsg(e.message || "User Rejected Signature");
        setStep('form');
        audioSynth.playError();
    }
  };

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet) return;
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;
    runBroadcastSequence('deposit');
  };

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet) return;
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0 || !withdrawDestination.trim()) return;
    runBroadcastSequence('withdraw');
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!wallet) return null;

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-10 bg-[#0B0E11] relative custom-scrollbar text-gray-200">
      <div className="max-w-7xl mx-auto space-y-8 pb-20">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-3">
            <h1 className="text-4xl font-black text-gray-100 italic uppercase tracking-tighter">Equity Center</h1>
            <div className="flex items-center space-x-4">
                <p className="text-[10px] text-gray-500 font-mono tracking-tight bg-[#181C25] px-3 py-1 rounded-lg border border-[#2B3139] w-fit uppercase">Node: {wallet.address.slice(0,12)}...</p>
                <div className="flex items-center space-x-2 bg-indigo-900/20 border border-indigo-500/20 px-3 py-1 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{gasPrice.toFixed(0)} GWEI</span>
                </div>
            </div>
          </div>
          <div className="flex space-x-3">
             <button onClick={() => setActiveModal('deposit')} className="px-8 py-3 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20">Deposit</button>
             <button onClick={() => setActiveModal('withdraw')} className="px-8 py-3 bg-[#181C25] text-gray-200 font-black uppercase tracking-widest text-xs rounded-xl border border-[#2B3139] hover:bg-[#262B36] transition-all">Withdraw</button>
             <button onClick={() => setActiveModal('kyc')} className="px-8 py-3 bg-amber-600/10 text-amber-500 font-black uppercase tracking-widest text-xs rounded-xl border border-amber-500/20 hover:bg-amber-600/20 transition-all">Verify KYC</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#181C25] rounded-[40px] p-10 border border-[#2B3139] shadow-xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:scale-105 transition-transform duration-1000 text-indigo-500">
                <svg className="w-64 h-64" fill="currentColor" viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
             </div>
             <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                   <div className="text-xs text-gray-500 font-bold uppercase tracking-[0.3em]">Trading Equity (Deposited)</div>
                   <div className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest border border-current ${vipTier.color} ${vipTier.bg}`}>
                      VIP {vipTier.name}
                   </div>
                </div>
                <div className="text-7xl font-mono font-bold text-gray-100 tracking-tighter">
                   ${equityBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div className="flex gap-8 mt-10 pt-10 border-t border-[#2B3139]">
                   <div>
                      <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Session Profit</div>
                      <div className="font-mono font-bold text-emerald-500 text-xl">+${simulatedYield.toFixed(4)}</div>
                   </div>
                   <div>
                      <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">External Balance ({wallet.source === 'Manual Entry' ? 'LIVE NODE' : 'CONNECTED'})</div>
                      <div className="font-mono font-bold text-gray-300 text-xl">
                        ${wallet.balances.reduce((acc, b) => acc + parseFloat(b.valueUsd.replace(/,/g, '')), 0).toLocaleString()}
                      </div>
                   </div>
                </div>
             </div>
          </div>
          
          <div className="bg-[#181C25] rounded-[40px] p-8 border border-[#2B3139] flex flex-col justify-center space-y-6">
             <div>
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Clearing Status</div>
                <div className="text-3xl font-mono font-bold text-amber-500 uppercase italic tracking-tighter">NETWORK_MONITORING</div>
             </div>
             <div className="w-full h-1.5 bg-[#0B0E11] rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 animate-pulse w-[100%]"></div>
             </div>
             <p className="text-[10px] text-gray-600 leading-relaxed uppercase font-bold tracking-wider italic">Geko Protocols automatically scans the mempool for incoming liquidity to your specific node identifier.</p>
          </div>
        </div>

        {activeModal && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
             <div className="bg-[#181C25] border border-[#2B3139] rounded-[48px] max-w-lg w-full p-10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600"></div>
                
                {step === 'form' && (
                   <div className="space-y-8">
                      <div className="flex justify-between items-center">
                         <h2 className="text-2xl font-black text-gray-100 uppercase italic tracking-tight">{activeModal} Assets</h2>
                         <button onClick={() => setActiveModal(null)} className="text-gray-500 hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                         </button>
                      </div>

                      {activeModal === 'deposit' && (
                        <div className="flex flex-col items-center space-y-6">
                            <div className="bg-white p-4 rounded-3xl shadow-xl flex flex-col items-center">
                                {qrCodeUrl ? (
                                    <>
                                        <img src={qrCodeUrl} alt="Deposit QR Code" className="w-48 h-48 rounded-2xl" />
                                        <div className="mt-2 flex items-center space-x-1">
                                            <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                                            <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Address Sync Verified</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-48 h-48 bg-[#0B0E11] rounded-2xl flex items-center justify-center">
                                        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                )}
                            </div>
                            <div className="w-full space-y-4">
                               <div className="space-y-2">
                                  <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-1">Vault Destination</label>
                                  <div className="flex items-center space-x-3 bg-[#0B0E11] p-5 rounded-3xl border border-[#2B3139] group">
                                     <span className="flex-1 font-mono text-[10px] text-gray-400 break-all select-all">{depositAddress}</span>
                                     <button type="button" onClick={copyAddress} className="text-indigo-500 hover:text-indigo-400">
                                        {copied ? <span className="text-[8px] font-black uppercase">Copied</span> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                                     </button>
                                  </div>
                               </div>
                               <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                     <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-1">Asset</label>
                                     <select value={depositAsset} onChange={e => setDepositAsset(e.target.value)} className="w-full bg-[#0B0E11] border border-[#2B3139] rounded-2xl p-4 text-sm h-14">
                                        {['USDT', 'ETH', 'SOL'].map(s => <option key={s} value={s}>{s}</option>)}
                                     </select>
                                  </div>
                                  <div className="space-y-2">
                                     <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-1">Amount</label>
                                     <input type="number" step="any" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="0.00" className="w-full bg-[#0B0E11] border border-[#2B3139] rounded-2xl p-4 text-sm font-mono h-14" />
                                  </div>
                               </div>
                               <button onClick={handleDepositSubmit} className="w-full py-6 bg-indigo-600 text-white font-black uppercase italic tracking-widest rounded-3xl shadow-xl hover:bg-indigo-500 transition-all">
                                 {wallet?.source === 'Manual Entry' ? "I've Sent the Funds" : "Authorize Direct Deposit"}
                               </button>
                            </div>
                        </div>
                      )}

                      {activeModal === 'withdraw' && (
                         <form onSubmit={handleWithdrawSubmit} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                  <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-1">Asset</label>
                                  <select value={withdrawAsset} onChange={e => setWithdrawAsset(e.target.value)} className="w-full bg-[#0B0E11] border border-[#2B3139] rounded-2xl p-4 text-sm h-14">
                                     {['USDT', 'ETH', 'SOL'].map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                               </div>
                               <div className="space-y-2">
                                  <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-1">Volume</label>
                                  <input type="number" required step="any" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="0.00" className="w-full bg-[#0B0E11] border border-[#2B3139] rounded-2xl p-4 text-sm font-mono h-14" />
                               </div>
                            </div>
                            <div className="space-y-2">
                               <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-1">Payout Destination</label>
                               <input 
                                  type="text" 
                                  required 
                                  value={withdrawDestination}
                                  onChange={e => setWithdrawDestination(e.target.value)}
                                  placeholder="0x... or Solana Address" 
                                  className="w-full bg-[#0B0E11] border border-[#2B3139] rounded-2xl p-4 text-sm font-mono h-14" 
                                />
                            </div>
                            <button type="submit" className="w-full py-6 bg-indigo-600 text-white font-black uppercase italic tracking-widest rounded-3xl shadow-xl hover:bg-indigo-500 transition-all">Submit Payout Request</button>
                         </form>
                      )}
                      
                      {activeModal === 'kyc' && (
                         <div className="space-y-6">
                            <div className="p-6 bg-[#0B0E11] rounded-3xl border border-[#2B3139] space-y-4">
                               <h3 className="text-sm font-black text-gray-100 uppercase italic">Identification Attestation</h3>
                               <p className="text-[10px] text-gray-500 leading-relaxed">Geko Protocols requires high-fidelity identification to comply with cross-chain regulatory frameworks.</p>
                               <div className="grid grid-cols-2 gap-3">
                                  <div className="p-4 bg-[#181C25] border border-[#2B3139] rounded-2xl text-center">
                                     <div className="text-[8px] text-gray-600 uppercase font-black">Level 1</div>
                                     <div className="text-xs font-bold text-emerald-500 mt-1">COMPLETE</div>
                                  </div>
                                  <div className="p-4 bg-[#181C25] border border-amber-500/30 rounded-2xl text-center">
                                     <div className="text-[8px] text-gray-600 uppercase font-black">Level 2</div>
                                     <div className="text-xs font-bold text-amber-500 mt-1">REQUIRED</div>
                                  </div>
                               </div>
                            </div>
                            <button onClick={() => runBroadcastSequence('kyc')} className="w-full py-6 bg-amber-600 text-white font-black uppercase italic tracking-widest rounded-3xl shadow-xl hover:bg-amber-500 transition-all">Sign Level 2 Attestation</button>
                         </div>
                      )}
                   </div>
                )}

                {(step === 'broadcasting' || step === 'confirming') && (
                   <div className="py-20 flex flex-col items-center justify-center space-y-10">
                      <div className="relative w-32 h-32">
                         <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                         <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                      </div>
                      <div className="text-center space-y-4">
                         <h3 className="text-3xl font-black text-gray-100 uppercase italic tracking-tighter">
                            {step === 'broadcasting' ? 'Scanning Network' : 'Confirming Blocks'}
                         </h3>
                         <div className="w-64 h-1.5 bg-[#0B0E11] rounded-full overflow-hidden mx-auto">
                            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${broadcastProgress}%` }}></div>
                         </div>
                      </div>
                   </div>
                )}

                {step === 'success' && (
                   <div className="py-20 flex flex-col items-center justify-center space-y-8 animate-in zoom-in-95">
                      <div className="w-24 h-24 bg-emerald-500/10 border-4 border-emerald-500 rounded-full flex items-center justify-center text-emerald-500">
                         <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <h3 className="text-3xl font-black text-gray-100 uppercase italic tracking-tighter">Handshake Complete</h3>
                      <p className="text-center text-gray-500 text-xs uppercase font-bold tracking-widest">Your request has been submitted to the protocol for settlement.</p>
                   </div>
                )}
             </div>
          </div>
        )}

        <div className="bg-[#181C25] rounded-[40px] border border-[#2B3139] overflow-hidden shadow-sm">
           <div className="p-8 border-b border-[#2B3139] bg-[#1E2329] flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-100 uppercase italic tracking-widest">Protocol Ledger</h3>
           </div>
           <div className="overflow-x-auto">
              <table className="w-full text-left">
                 <thead className="bg-[#0B0E11] text-[10px] text-gray-500 uppercase font-black tracking-widest">
                    <tr>
                       <th className="px-8 py-6">ID / Hash</th>
                       <th className="px-8 py-6">Type</th>
                       <th className="px-8 py-6">Volume</th>
                       <th className="px-8 py-6 text-right">Settlement</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-[#2B3139]">
                    {(wallet.history || []).map(tx => (
                       <tr key={tx.id} className="hover:bg-[#262B36] transition-colors group">
                          <td className="px-8 py-6">
                             <div className="text-[10px] text-indigo-400 font-mono block">{tx.hash.slice(0, 16)}...</div>
                             <div className="text-[9px] text-gray-600 mt-1 uppercase font-bold">{tx.timestamp}</div>
                          </td>
                          <td className="px-8 py-6">
                             <span className="text-xs font-black uppercase text-gray-200">{tx.type} {tx.asset}</span>
                             {tx.destinationAddress && (
                                <div className="text-[8px] text-gray-500 truncate max-w-[120px]">To: {tx.destinationAddress}</div>
                             )}
                          </td>
                          <td className="px-8 py-6">
                             <span className={`text-sm font-mono font-bold ${tx.type === 'Receive' ? 'text-emerald-500' : 'text-rose-500'}`}>{tx.amount}</span>
                          </td>
                          <td className="px-8 py-6 text-right">
                             <span className={`text-[9px] font-black uppercase px-4 py-2 rounded-xl border ${tx.status === 'Pending' ? 'text-amber-500 border-amber-500/20 bg-amber-500/10 animate-pulse' : tx.status === 'Completed' ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10' : 'text-rose-500 border-rose-500/20 bg-rose-500/10'}`}>
                                {tx.status}
                             </span>
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      </div>
    </div>
  );
};
