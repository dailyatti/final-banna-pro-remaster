import React, { useRef } from 'react';
import { Sparkles, ChevronDown, BookOpen, Check, Settings, Key } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { SUPPORTED_LANGUAGES } from '../../services/translations';
import { useApiKey } from '../../context/ApiKeyContext';

interface HeaderProps {
    onOpenDocs: () => void;
    isLangMenuOpen: boolean;
    setIsLangMenuOpen: (isOpen: boolean) => void;
    onLanguageChange: (code: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenDocs, isLangMenuOpen, setIsLangMenuOpen, onLanguageChange }) => {
    const { t, i18n } = useTranslation();
    const { clearApiKey } = useApiKey();
    const langMenuRef = useRef<HTMLDivElement>(null);

    const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

    return (
        <header className="fixed top-0 left-0 right-0 z-50 h-20 transition-all duration-300 bg-[#020617]/80 backdrop-blur-xl border-b border-white/5">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-full flex items-center justify-between">

                {/* Logo Area */}
                <div className="flex items-center gap-4 group cursor-pointer">
                    <div className="relative w-10 h-10">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-xl blur-md opacity-50 group-hover:opacity-80 transition-opacity" />
                        <div className="relative w-full h-full bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg border border-white/10">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-lg font-display font-bold text-white leading-none tracking-tight group-hover:text-emerald-400 transition-colors">{t('appTitle')}</h1>
                        <p className="text-[10px] text-slate-400 uppercase tracking-[0.25em] font-bold mt-1.5">Studio Edition</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                    {/* Language Selector */}
                    <div className="relative" ref={langMenuRef}>
                        <button
                            onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl px-3 py-2 transition-all active:scale-95"
                        >
                            <span className="text-lg">{currentLang.flag}</span>
                            <span className="text-sm font-medium text-slate-300 hidden md:block">{currentLang.name}</span>
                            <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isLangMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                            {isLangMenuOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute top-full right-0 mt-2 w-56 bg-[#0f172a] border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden"
                                >
                                    {SUPPORTED_LANGUAGES.map((lang) => (
                                        <button
                                            key={lang.code}
                                            onClick={() => onLanguageChange(lang.code)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors ${i18n.language === lang.code ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-300'}`}
                                        >
                                            <span className="text-lg">{lang.flag}</span>
                                            <span>{lang.name}</span>
                                            {i18n.language === lang.code && <Check className="w-3 h-3 ml-auto" />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Docs Button */}
                    <button
                        onClick={onOpenDocs}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-all active:scale-95"
                    >
                        <BookOpen className="w-4 h-4 text-indigo-400" />
                        <span className="hidden md:block">{t('docs')}</span>
                    </button>

                    {/* API Key Settings */}
                    <button
                        onClick={clearApiKey}
                        className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/30 rounded-xl text-sm font-medium text-emerald-400 transition-all active:scale-95 group"
                        title="Change API Key"
                    >
                        <Key className="w-4 h-4" />
                        <span className="hidden md:block">API Key</span>
                    </button>
                </div>
            </div>
        </header>
    );
};
