import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="w-full p-4 md:p-6 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-banana-400 to-banana-600 flex items-center justify-center text-slate-900 font-bold text-xl shadow-lg shadow-banana-500/20 transform hover:scale-105 transition-transform">
            N
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg md:text-xl font-bold text-white tracking-tight leading-none">Nano Banana</h1>
            <span className="text-[10px] md:text-xs text-banana-400/80 font-medium tracking-widest uppercase">Studio Pro</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full border border-slate-800">
               <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
               <span className="text-xs text-slate-300 font-medium">v2.0 Stable</span>
            </div>
        </div>
      </div>
    </header>
  );
};