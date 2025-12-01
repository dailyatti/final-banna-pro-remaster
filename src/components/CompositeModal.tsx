import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Layers, Check, Sparkles, Settings2, ImageIcon, ShoppingBag, Shirt, Coffee, Smartphone, Bed, Palette, Bath } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ImageItem, OutputFormat, AiResolution, AspectRatio } from '../types';
import { POD_PRESETS, PodPreset } from '../data/podPresets';

interface CompositeConfig {
  prompt: string;
  format: OutputFormat;
  resolution: AiResolution;
  aspectRatio: AspectRatio;
}

interface CompositeModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: ImageItem[];
  config: CompositeConfig;
  onConfigChange: (updates: Partial<CompositeConfig>) => void;
  onGenerate: (
    selectedIds: string[],
    prompt: string,
    config: { format: OutputFormat; resolution: AiResolution; aspectRatio: AspectRatio }
  ) => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  activeTab: 'composite' | 'pod';
  onTabChange: (tab: 'composite' | 'pod') => void;
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  onUpload?: (files: File[]) => void;
  onGenerateImage?: (prompt: string) => Promise<void>;
}

export const CompositeModal: React.FC<CompositeModalProps> = ({
  isOpen,
  onClose,
  images,
  config,
  onConfigChange,
  onGenerate,
  selectedIds,
  onSelectionChange,
  activeTab,
  onTabChange,
  selectedCategory,
  onCategoryChange,
  onUpload,
  onGenerateImage
}) => {
  const { t, i18n } = useTranslation();
  const [localPrompt, setLocalPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLocalGenerate = async () => {
    if (!localPrompt.trim() || !onGenerateImage) return;
    setIsGenerating(true);
    try {
      await onGenerateImage(localPrompt);
      setLocalPrompt('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onUpload) {
      onUpload(Array.from(e.target.files));
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onSelectionChange(newSet);
  };

  const handleGenerate = () => {
    onGenerate(Array.from(selectedIds), config.prompt, {
      format: config.format,
      resolution: config.resolution,
      aspectRatio: config.aspectRatio
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-[#0f172a] border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
      >

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-[#020617]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-pink-500/10 rounded-lg">
              <Layers className="w-5 h-5 text-pink-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{t('composite')}</h2>
              <p className="text-xs text-slate-400">{t('compositeDesc')}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-[#020617]">
          <button
            onClick={() => onTabChange('composite')}
            className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'composite' ? 'text-pink-500 border-b-2 border-pink-500 bg-pink-500/5' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {t('composite')}
          </button>
          <button
            onClick={() => onTabChange('pod')}
            className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'pod' ? 'text-blue-500 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300'}`}
          >
            POD Studio
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">

          {activeTab === 'composite' ? (
            <>
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> {t('selectImages')} ({selectedIds.size})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
                {images.map(img => {
                  const isSelected = selectedIds.has(img.id);
                  const displayUrl = img.processedUrl || img.previewUrl;

                  return (
                    <div
                      key={img.id}
                      onClick={() => toggleSelection(img.id)}
                      className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all group ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-800 hover:border-slate-600'}`}
                    >
                      <img src={displayUrl} alt="" className={`w-full h-full object-cover transition-all ${isSelected ? 'opacity-100' : 'opacity-60 group-hover:opacity-80'}`} />
                      <div className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-900/50 border border-slate-600'}`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                      {img.processedUrl && (
                        <div className="absolute bottom-2 left-2 bg-purple-500/80 text-white text-[10px] px-1.5 py-0.5 rounded">
                          AI
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Configuration Section */}
              <div className="mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-pink-400" /> {t('compositeConfig')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">{t('format')}</label>
                    <select
                      value={config.format}
                      onChange={(e) => onConfigChange({ format: e.target.value as OutputFormat })}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-pink-500/50"
                    >
                      <option value={OutputFormat.JPG}>JPG</option>
                      <option value={OutputFormat.PNG}>PNG</option>
                      <option value={OutputFormat.WEBP}>WEBP</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">{t('aspectRatio')}</label>
                    <select
                      value={config.aspectRatio}
                      onChange={(e) => onConfigChange({ aspectRatio: e.target.value as AspectRatio })}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-pink-500/50"
                    >
                      <option value={AspectRatio.SQUARE}>1:1 Square</option>
                      <option value={AspectRatio.LANDSCAPE}>16:9 Wide</option>
                      <option value={AspectRatio.PORTRAIT}>9:16 Tall</option>
                      <option value={AspectRatio.STANDARD_LANDSCAPE}>4:3 Photo</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">{t('resolution')}</label>
                    <select
                      value={config.resolution}
                      onChange={(e) => onConfigChange({ resolution: e.target.value as AiResolution })}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-pink-500/50"
                    >
                      <option value={AiResolution.RES_1K}>1K</option>
                      <option value={AiResolution.RES_2K}>2K</option>
                      <option value={AiResolution.RES_4K}>4K</option>
                    </select>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.values(POD_PRESETS).map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => onCategoryChange(preset.id)}
                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${selectedCategory === preset.id ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}
                  >
                    {preset.id === 'tshirt' && <Shirt className="w-6 h-6" />}
                    {preset.id === 'mug' && <Coffee className="w-6 h-6" />}
                    {preset.id === 'phone_case' && <Smartphone className="w-6 h-6" />}
                    {preset.id === 'pillow' && <div className="w-6 h-6 border-2 border-current rounded-lg" />}
                    {preset.id === 'canvas' && <Palette className="w-6 h-6" />}
                    {preset.id === 'bedding' && <Bed className="w-6 h-6" />}
                    {preset.id === 'curtain' && <Bath className="w-6 h-6" />}
                    <span className="text-xs font-bold">{preset.label[i18n.language as 'en' | 'hu'] || preset.label.en}</span>
                  </button>
                ))}
              </div>

              {/* DESIGN SOURCE SECTION */}
              <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Palette className="w-4 h-4 text-blue-400" /> Design Source
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Upload Option */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-slate-900/50 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/50 rounded-xl p-4 cursor-pointer transition-all group flex flex-col items-center justify-center gap-2 text-center h-32"
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileUpload}
                    />
                    <div className="p-3 bg-blue-500/10 rounded-full group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-200 text-sm">Upload Image</div>
                      <div className="text-[10px] text-slate-500">Use your own design</div>
                    </div>
                  </div>

                  {/* Generate Option */}
                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 h-32">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span className="font-bold text-slate-200 text-sm">Generate Pattern</span>
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      <input
                        type="text"
                        value={localPrompt}
                        onChange={(e) => setLocalPrompt(e.target.value)}
                        placeholder="E.g. Floral pattern, Cyberpunk texture..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-purple-500/50"
                        onKeyDown={(e) => e.key === 'Enter' && handleLocalGenerate()}
                      />
                      <button
                        onClick={handleLocalGenerate}
                        disabled={isGenerating || !localPrompt.trim()}
                        className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        {isGenerating ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Generate'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* LIBRARY SELECTION */}
              <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300 delay-100">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" /> Select from Library ({selectedIds.size})
                </h3>

                {images.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
                    <p className="text-slate-500 text-xs">No images in library. Upload or generate one above.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                    {images.map(img => {
                      const isSelected = selectedIds.has(img.id);
                      const displayUrl = img.processedUrl || img.previewUrl;

                      return (
                        <div
                          key={img.id}
                          onClick={() => toggleSelection(img.id)}
                          className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all group ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-800 hover:border-slate-600'}`}
                        >
                          <img src={displayUrl} alt="" className={`w-full h-full object-cover transition-all ${isSelected ? 'opacity-100' : 'opacity-60 group-hover:opacity-80'}`} />
                          <div className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-900/50 border border-slate-600'}`}>
                            {isSelected && <Check className="w-2.5 h-2.5" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedCategory && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">{t('selectTemplate')}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {POD_PRESETS[selectedCategory].prompts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => onConfigChange({ prompt: p.text[i18n.language as 'en' | 'hu'] || p.text.en })}
                        className="text-left p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800 transition-all group"
                      >
                        <div className="font-bold text-slate-200 text-sm mb-1 group-hover:text-blue-400">{p.label[i18n.language as 'en' | 'hu'] || p.label.en}</div>
                        <div className="text-xs text-slate-500 line-clamp-2">{p.text[i18n.language as 'en' | 'hu'] || p.text.en}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 mt-6">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">{t('compositePrompt')}</h3>
            <textarea
              value={config.prompt}
              onChange={(e) => onConfigChange({ prompt: e.target.value })}
              placeholder="Describe how to merge these images (e.g., 'Double exposure of the portrait and the forest', 'Cyberpunk collage')"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 text-sm focus:border-pink-500/50 outline-none h-24 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 bg-[#020617] flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-lg font-bold text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            {t('cancel')}
          </button>
          <button
            onClick={handleGenerate}
            disabled={selectedIds.size < 1}
            className={`px-6 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg transition-all ${selectedIds.size < 1 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-pink-900/20'}`}
          >
            <Sparkles className="w-4 h-4" /> {t('createComposite')}
          </button>
        </div>

      </motion.div>
    </div>
  );
};
