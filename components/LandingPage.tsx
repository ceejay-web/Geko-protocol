import React, { useState } from 'react';
import { authService } from '../services/authService';
import { WalletData } from '../types';

interface LandingPageProps {
  onLoginSuccess: (data: WalletData) => void;
  onConnectWalletClick: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginSuccess, onConnectWalletClick }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      let walletData: WalletData;
      if (authMode === 'signup') {
        walletData = await authService.signUp(email, password);
      } else {
        walletData = await authService.loginWithEmailPassword(email, password);
      }
      onLoginSuccess(walletData);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E11] flex items-center justify-center relative overflow-hidden font-sans text-gray-200">
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none"></div>
      
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 p-6 relative z-10">
        
        <div className="flex flex-col justify-center space-y-10 order-2 lg:order-1">
           <div className="space-y-6">
                <div className="w-24 h-24 lg:w-32 lg:h-32">
                    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-2xl">
                        <defs>
                            <linearGradient id="logoG" x1="0" y1="0" x2="100" y2="100">
                                <stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#a855f7" />
                            </linearGradient>
                        </defs>
                        <path d="M50 0L93.3 25V75L50 100L6.7 75V25L50 0Z" fill="url(#logoG)" />
                        <circle cx="50" cy="50" r="10" fill="#0B0E11" />
                    </svg>
                </div>
                <div className="space-y-2">
                    <h1 className="text-5xl lg:text-7xl font-black italic uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-500">
                        GEKO<br />PROTOCOL
                    </h1>
                    <p className="text-sm text-gray-500 font-bold uppercase tracking-[0.3em]">Institutional Digital Asset Terminal</p>
                </div>
           </div>
        </div>

        <div className="flex flex-col justify-center order-1 lg:order-2">
            <div className="bg-[#181C25] border border-[#2B3139] p-8 lg:p-12 rounded-[48px] shadow-2xl relative overflow-hidden backdrop-blur-xl">
                <div className="relative z-10 space-y-8">
                    <div className="text-center space-y-1">
                        <h2 className="text-2xl font-black text-gray-100 uppercase italic tracking-tight">
                            {authMode === 'login' ? 'Access Terminal' : 'Initialize Node'}
                        </h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">Secure Cryptographic Entry</p>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-4">
                        {error && <div className="p-3 bg-rose-900/20 border border-rose-500/20 rounded-xl text-center text-xs text-rose-400 font-bold">{error}</div>}
                        <div className="space-y-4">
                            <input 
                                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                placeholder="Institutional Email" 
                                className="w-full bg-[#0B0E11] border border-[#2B3139] rounded-2xl px-5 py-4 text-sm focus:border-indigo-500 outline-none transition-colors"
                            />
                            <input 
                                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                                placeholder="Access Key (Password)" 
                                className="w-full bg-[#0B0E11] border border-[#2B3139] rounded-2xl px-5 py-4 text-sm focus:border-indigo-500 outline-none transition-colors"
                            />
                        </div>
                        <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-[0.2em] py-5 rounded-2xl shadow-xl transition-all disabled:opacity-50 text-xs">
                            {isLoading ? 'Processing...' : (authMode === 'login' ? 'Enter Protocol' : 'Create Identity')}
                        </button>
                    </form>

                    <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#2B3139]"></div></div><div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest"><span className="px-2 bg-[#181C25] text-gray-500">Or Link Hardware</span></div></div>

                    <button onClick={onConnectWalletClick} className="w-full bg-[#0B0E11] hover:bg-[#262B36] border border-[#2B3139] py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-300 transition-all flex items-center justify-center space-x-3">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        <span>Scan Web3 Wallet</span>
                    </button>

                    <div className="text-center">
                        <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-[10px] text-gray-500 font-bold uppercase tracking-widest hover:text-indigo-400 transition-colors">
                            {authMode === 'login' ? 'New User? Initialize Identity' : 'Existing Node? Access Here'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};