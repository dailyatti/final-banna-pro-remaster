import React, { useState } from 'react';
import { Key, ExternalLink, Check, AlertCircle, Sparkles, Bot } from 'lucide-react';
import { useApiKey } from '../../context/ApiKeyContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ImageProvider } from '../../types';

type TabType = 'gemini' | 'openai';

export const ApiKeyModal: React.FC = () => {
    const { t } = useTranslation();
    const {
        geminiApiKey,
        setGeminiApiKey,
        openaiApiKey,
        setOpenaiApiKey,
        activeProvider,
        setActiveProvider,
        isGeminiKeyValid,
        isOpenaiKeyValid
    } = useApiKey();

    const [activeTab, setActiveTab] = useState<TabType>('gemini');
    const [geminiInput, setGeminiInput] = useState('');
    const [openaiInput, setOpenaiInput] = useState('');
    const [error, setError] = useState('');

    // If we have at least one key, don't show the modal
    if (geminiApiKey || openaiApiKey) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (activeTab === 'gemini') {
            if (geminiInput.length < 30) {
                setError(t('invalidGeminiKey') || 'Invalid Gemini API Key format. It should start with AIza...');
                return;
            }
            setGeminiApiKey(geminiInput);
            setActiveProvider('gemini');
        } else {
            if (openaiInput.length < 30 || !openaiInput.startsWith('sk-')) {
                setError(t('invalidOpenaiKey') || 'Invalid OpenAI API Key format. It should start with sk-...');
                return;
            }
            setOpenaiApiKey(openaiInput);
            setActiveProvider('openai');
        }
    };

    const TabButton = ({ tab, label, icon: Icon }: { tab: TabType; label: string; icon: React.ComponentType<any> }) => (
        <button
            type="button"
            onClick={() => { setActiveTab(tab); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all ${activeTab === tab
                ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
        >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
        </button>
    );

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
                >
                    <div className="p-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500" />

                    <div className="p-8">
                        <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center mb-6 border border-slate-800 shadow-inner">
                            <Key className="w-6 h-6 text-emerald-400" />
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-2">
                            {t('selectProvider') || 'Select AI Provider'}
                        </h2>
                        <p className="text-slate-400 mb-6 leading-relaxed">
                            {t('apiKeyDesc') || 'Choose your preferred AI provider and enter your API key. Your key is stored locally and never sent to our servers.'}
                        </p>

                        {/* Tab Selector */}
                        <div className="flex gap-2 mb-6">
                            <TabButton tab="gemini" label={t('providerGemini') || 'Google Gemini'} icon={Sparkles} />
                            <TabButton tab="openai" label={t('providerOpenai') || 'OpenAI GPT-1.5'} icon={Bot} />
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {activeTab === 'gemini' ? (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                        {t('geminiApiKey') || 'Gemini API Key'}
                                    </label>
                                    <input
                                        type="password"
                                        value={geminiInput}
                                        onChange={(e) => {
                                            setGeminiInput(e.target.value);
                                            setError('');
                                        }}
                                        placeholder="AIzaSy..."
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                        autoFocus
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                        {t('openaiApiKey') || 'OpenAI API Key'}
                                    </label>
                                    <input
                                        type="password"
                                        value={openaiInput}
                                        onChange={(e) => {
                                            setOpenaiInput(e.target.value);
                                            setError('');
                                        }}
                                        placeholder="sk-..."
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                                        autoFocus
                                    />
                                </div>
                            )}

                            {error && (
                                <div className="flex items-center gap-2 text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={activeTab === 'gemini' ? !geminiInput : !openaiInput}
                                className={`w-full font-bold py-3 px-6 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${activeTab === 'gemini'
                                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-500/20'
                                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-500/20'
                                    }`}
                            >
                                <span>{t('startStudio') || 'Start Studio'}</span>
                                <Check className="w-4 h-4" />
                            </button>
                        </form>

                        <div className="mt-6 pt-6 border-t border-slate-800/50 space-y-2">
                            {activeTab === 'gemini' ? (
                                <a
                                    href="https://aistudio.google.com/app/apikey"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors group"
                                >
                                    <span>{t('getGeminiKey') || 'Get a free API key from Google'}</span>
                                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                </a>
                            ) : (
                                <a
                                    href="https://platform.openai.com/api-keys"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors group"
                                >
                                    <span>{t('getOpenaiKey') || 'Get an API key from OpenAI'}</span>
                                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                </a>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
