import React from 'react';
import { X, BookOpen, Layers, Zap, Download, Monitor, Shirt, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface UserGuideProps {
    isOpen: boolean;
    onClose: () => void;
}

export const UserGuide: React.FC<UserGuideProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            <div className="relative bg-[#0f172a] border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-[#020617]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <BookOpen className="w-5 h-5 text-emerald-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">{t('guideTitle')}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 overflow-y-auto max-h-[70vh] space-y-8">

                    <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-emerald-400" />
                            {t('guideSection1Title')}
                        </h3>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            {t('guideSection1Text')}
                        </p>
                        <ul className="mt-2 space-y-1 ml-6 list-disc text-slate-400 text-sm">
                            <li><span className="text-slate-200">Outpainting:</span> {t('guideSection1List1')}</li>
                            <li><span className="text-slate-200">Upscaling:</span> {t('guideSection1List2')}</li>
                            <li><span className="text-slate-200">Composition Correction:</span> {t('guideSection1List3')}</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-400" />
                            {t('guideSection2Title')}
                        </h3>
                        <p className="text-slate-400 text-sm leading-relaxed mb-2">
                            {t('guideSection2Text1')}
                        </p>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            {t('guideSection2Text2')}
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <Shirt className="w-4 h-4 text-emerald-400" />
                            {t('guideSection3Title')}
                        </h3>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            {t('guideSection3Text')}
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-400" />
                            {t('guideSection4Title')}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                <span className="text-xs font-bold text-emerald-400 uppercase">{t('guideSection4AspectRatio')}</span>
                                <p className="text-slate-400 text-xs mt-1">
                                    {t('guideSection4AspectRatioText')}
                                </p>
                            </div>
                            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                <span className="text-xs font-bold text-emerald-400 uppercase">{t('guideSection4Resolution')}</span>
                                <p className="text-slate-400 text-xs mt-1">
                                    {t('guideSection4ResolutionText')}
                                </p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <Download className="w-4 h-4 text-emerald-400" />
                            {t('guideSection5Title')}
                        </h3>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            {t('guideSection5Text')}
                        </p>
                    </section>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-800 bg-[#020617] text-center">
                    <p className="text-xs text-slate-500">
                        {t('guideFooter')}
                    </p>
                </div>

            </div>
        </div>
    );
};
