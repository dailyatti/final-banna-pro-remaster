import React, { useState } from 'react';
import { Key, ExternalLink, Check, AlertCircle, Sparkles } from 'lucide-react';
import { useApiKey } from '../../context/ApiKeyContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export const ApiKeyModal: React.FC = () => {
    const { t } = useTranslation();
    const { apiKey, setApiKey } = useApiKey();

    const [inputKey, setInputKey] = useState('');
    const [error, setError] = useState('');

    // If we have a key, don't show the modal
    if (apiKey) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (inputKey.length < 30) {
            setError(t('invalidGeminiKey') || 'Invalid Gemini API Key format. It should start with AIza...');
            return;
        }
        setApiKey(inputKey);
    };

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
                            {t('apiKeyRequired') || 'API Key Required'}
                        </h2>
                        <p className="text-slate-400 mb-6 leading-relaxed">
                            {t('apiKeyDesc') || 'Enter your Google Gemini API key. Your key is stored locally and never sent to our servers.'}
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                    {t('geminiApiKey') || 'Gemini API Key'}
                                </label>
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles className="w-4 h-4 text-emerald-400" />
                                    <span className="text-xs text-emerald-400">Google Gemini</span>
                                </div>
                                <input
                                    type="password"
                                    value={inputKey}
                                    onChange={(e) => {
                                        setInputKey(e.target.value);
                                        setError('');
                                    }}
                                    placeholder="AIzaSy..."
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                    autoFocus
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={!inputKey}
                                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <span>{t('startStudio') || 'Start Studio'}</span>
                                <Check className="w-4 h-4" />
                            </button>
                        </form>

                        <div className="mt-6 pt-6 border-t border-slate-800/50">
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors group"
                            >
                                <span>{t('getGeminiKey') || 'Get a free API key from Google'}</span>
                                <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </a>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
