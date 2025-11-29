import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Sparkles, Wand2 } from 'lucide-react';

export const Hero: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div className="relative text-center mb-16 pt-10">
            {/* Background Elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 blur-[100px] rounded-full -z-10 animate-pulse" style={{ animationDuration: '4s' }}></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
            >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-emerald-400 text-xs font-medium mb-6 backdrop-blur-md">
                    <Sparkles className="w-3 h-3" />
                    <span>PhD Level AI Studio</span>
                </div>

                <h2 className="text-5xl md:text-7xl font-display font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-6 tracking-tight leading-[1.1]">
                    {t('introTitle')}
                </h2>

                <p className="text-slate-400 max-w-2xl mx-auto text-lg md:text-xl leading-relaxed font-light">
                    {t('introDesc')}
                </p>
            </motion.div>
        </div>
    );
};
