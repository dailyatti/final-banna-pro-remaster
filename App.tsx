import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Button } from './components/Button';
import { ApiKeyModal } from './components/ApiKeyModal';
import { AspectRatio, ImageItem, GenerationSettings, ExportFormat, ImageMetadata, CreditInfo } from './types';
import { generateEditedImage } from './services/gemini';

// --- UTILS ---

const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const getImageMetadata = (file: File): Promise<ImageMetadata> => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        sizeBytes: file.size,
        mimeType: file.type
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
};

const convertImageFormat = (imageUrl: string, format: ExportFormat): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Canvas context failed"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL(format, 0.92)); // High Quality
    };
    img.onerror = (e) => reject(e);
    img.src = imageUrl;
  });
};

// --- TYPES ---
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
    process?: {
      env: {
        [key: string]: string | undefined
      }
    }
  }
}

const App: React.FC = () => {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [settings, setSettings] = useState<GenerationSettings>({
    prompt: "",
    aspectRatio: AspectRatio.YOUTUBE,
    exportFormat: 'image/jpeg'
  });
  const [isDragging, setIsDragging] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  // API Key Management
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  // Credit Tracking - Gemini 3 Pro Image Preview pricing
  // Credit Tracking - Gemini 3 Pro Image Preview pricing
  const COST_PER_IMAGE = 0.134; // $0.134 per image output (official pricing)
  const [creditInfo, setCreditInfo] = useState<CreditInfo>({
    sessionGenerations: 0,
    estimatedSessionCost: 0,
    costPerImage: COST_PER_IMAGE
  });

  // --- CONSTANTS ---
  const REMOVE_TEXT_PROMPT = "DESTRUCTIVE OVERRIDE ACTIVE: Identify any text, watermarks, or captions on this image. Remove them completely and intelligently inpaint the background to match the surrounding texture and lighting. The result should be a clean image with NO text. Do not change the aspect ratio or the main subject, only remove the text.";


  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      // 1. Check Google Environment (IDX/SFX)
      if (window.aistudio) {
        try {
          const has = await window.aistudio.hasSelectedApiKey();
          if (has) {
            setHasApiKey(true);
            return;
          }
        } catch (e) { console.warn("AIStudio check failed", e); }
      }

      // 2. Check Local Storage (Netlify/Web)
      const localKey = localStorage.getItem('gemini_api_key');
      if (localKey) {
        if (window.process) {
          window.process.env.API_KEY = localKey;
        }
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const handleConnect = async () => {
    // 1. Try Google Environment First
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
        return;
      } catch (e) {
        console.warn("AIStudio open failed, falling back to manual input", e);
      }
    }

    // 2. Fallback to Manual Input
    setIsKeyModalOpen(true);
  };

  const handleSaveManualKey = (key: string) => {
    localStorage.setItem('gemini_api_key', key);
    if (window.process) {
      window.process.env.API_KEY = key;
    }
    setHasApiKey(true);
  };

  // --- HANDLERS ---

  // Credit tracking update helper
  const incrementCredits = () => {
    setCreditInfo(prev => ({
      ...prev,
      sessionGenerations: prev.sessionGenerations + 1,
      estimatedSessionCost: (prev.sessionGenerations + 1) * COST_PER_IMAGE
    }));
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;

    const newItems: ImageItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const metadata = await getImageMetadata(file);
      const previewUrl = URL.createObjectURL(file);

      newItems.push({
        id: Math.random().toString(36).substr(2, 9),
        originalFile: file,
        previewUrl,
        metadata,
        status: 'idle'
      });
    }

    setItems(prev => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const processImage = async (id: string, promptOverride?: string) => {
    if (!hasApiKey) {
      handleConnect();
      return;
    }

    const item = items.find(i => i.id === id);
    if (!item) return;

    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'processing', errorMessage: undefined } : i));

    try {
      // Convert File to Base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const b64 = (reader.result as string).replace(/^data:image\/[a-z]+;base64,/, "");
          resolve(b64);
        };
        reader.readAsDataURL(item.originalFile);
      });
      const base64 = await base64Promise;

      // Get API Key
      const apiKey = window.process?.env?.API_KEY || localStorage.getItem('gemini_api_key');
      if (!apiKey) throw new Error("API Key not found");

      // Generate with Pro model
      const promptToUse = promptOverride || settings.prompt;
      const result = await generateEditedImage(base64, promptToUse, settings.aspectRatio, apiKey);

      // Convert to Desired Export Format
      const convertedDataUrl = await convertImageFormat(result.url, settings.exportFormat);

      // Get Result Metadata (size estimation based on base64 length)
      const sizeEst = Math.round((convertedDataUrl.length * 3) / 4);
      const resultImg = new Image();
      resultImg.src = convertedDataUrl;
      await new Promise(r => resultImg.onload = r);

      setItems(prev => prev.map(i => i.id === id ? {
        ...i,
        status: 'success',
        resultUrl: convertedDataUrl,
        resultMetadata: {
          width: resultImg.naturalWidth,
          height: resultImg.naturalHeight,
          sizeBytes: sizeEst,
          mimeType: settings.exportFormat
        }
      } : i));

      // Update credit tracking
      incrementCredits();

    } catch (e: any) {
      if (e.message && e.message.includes("Requested entity was not found")) {
        setHasApiKey(false);
        handleConnect();
      }
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'error', errorMessage: e.message } : i));
    }
  };

  const processAll = async () => {
    if (!hasApiKey) {
      handleConnect();
      return;
    }

    setGlobalLoading(true);
    const idleItems = items.filter(i => i.status === 'idle' || i.status === 'error');

    // Process one by one to avoid rate limits
    for (const item of idleItems) {
      await processImage(item.id);
    }
    setGlobalLoading(false);
  };

  const downloadItem = (item: ImageItem) => {
    if (!item.resultUrl) return;
    const link = document.createElement('a');
    link.href = item.resultUrl;
    const ext = settings.exportFormat.split('/')[1];
    link.download = `nano_${item.id}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    const successfulItems = items.filter(i => i.status === 'success' && i.resultUrl);

    if (successfulItems.length === 0) return;

    successfulItems.forEach(item => {
      if (item.resultUrl) {
        const data = item.resultUrl.split(',')[1];
        const ext = settings.exportFormat.split('/')[1];
        zip.file(`nano_edit_${item.id}.${ext}`, data, { base64: true });
      }
    });

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "nano_banana_batch.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const removeTextVariant = async (id: string) => {
    const original = items.find(i => i.id === id);
    if (!original) return;

    // Create a new ID for the variant
    const variantId = Math.random().toString(36).substr(2, 9);

    // Create the variant item
    const variantItem: ImageItem = {
      ...original,
      id: variantId,
      status: 'idle', // Will be set to processing immediately by processImage
      previewUrl: original.previewUrl, // Use same preview
      originalFile: original.originalFile, // Use same file
      metadata: original.metadata,
      resultUrl: undefined,
      resultMetadata: undefined,
      errorMessage: undefined
    };

    // Add to state immediately after the original
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === original.id);
      const arr = [...prev];
      arr.splice(idx + 1, 0, variantItem);
      return arr;
    });

    // Trigger processing with the specific prompt
    // We need to wait for state update, but since we have the object, we can just call processImage logic
    // However, processImage relies on state for 'items'. 
    // Let's use a small timeout to ensure state is updated or pass the item directly if we refactored.
    // Better: processImage finds item by ID. So we just need to wait for the set state to reflect.
    // React state updates are batched. We can just call it, but it might not find the item yet if we don't wait.
    // Actually, let's just use setTimeout(..., 0) to push it to next tick.
    setTimeout(() => {
      processImage(variantId, REMOVE_TEXT_PROMPT);
    }, 0);
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-100 selection:bg-banana-500/30">
      <Header />

      <div id="modal-root">
        <ApiKeyModal
          isOpen={isKeyModalOpen || !hasApiKey}
          onClose={() => setIsKeyModalOpen(false)}
          onSave={handleSaveManualKey}
          canClose={hasApiKey}
        />
      </div>

      <main className="flex-grow max-w-7xl mx-auto w-full p-4 md:p-6 flex flex-col gap-8">

        {/* TOP BAR: API Status */}
        <div className="flex justify-end items-center gap-4">
          {hasApiKey ? (
            <div
              className="flex items-center gap-3 animate-fade-in bg-gradient-to-r from-slate-900/70 to-slate-800/50 backdrop-blur-xl rounded-full pl-3 pr-4 py-2 border border-emerald-500/30 cursor-pointer hover:border-emerald-400/50 transition-all shadow-lg shadow-emerald-500/10"
              onClick={() => setIsKeyModalOpen(true)}
              title="Click to manage API credentials"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50 animate-pulse"></span>
              <span className="text-xs font-semibold tracking-wide text-emerald-400">API Connected</span>
            </div>
          ) : (
            <Button
              size="sm"
              variant="primary"
              className="shadow-amber-500/30 shadow-lg animate-pulse bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400"
              onClick={handleConnect}
            >
              Connect API Credentials
            </Button>
          )}
        </div>

        {/* SETTINGS BAR */}
        <div className="bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-slate-800/30 backdrop-blur-2xl border border-slate-700/50 p-8 rounded-3xl shadow-2xl shadow-black/40 grid grid-cols-1 md:grid-cols-12 gap-6 items-end sticky top-24 z-40">

          {/* Prompt Input */}
          <div className="md:col-span-5 w-full space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-amber-400 uppercase tracking-wider">Generation Prompt</label>
              <span className="text-[10px] text-slate-400 bg-slate-800/70 px-2.5 py-1 rounded-full border border-slate-700/50">Optional</span>
            </div>
            <input
              type="text"
              placeholder="Describe the transformation you want..."
              value={settings.prompt}
              onChange={e => setSettings({ ...settings, prompt: e.target.value })}
              className="w-full bg-slate-950/70 border border-slate-700/50 rounded-xl px-4 py-3.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60 placeholder:text-slate-600 transition-all shadow-inner"
            />
          </div>

          {/* Aspect Ratio */}
          <div className="md:col-span-2 w-full space-y-2">
            <label className="text-xs font-bold text-amber-400 uppercase tracking-wider">Aspect Ratio</label>
            <div className="relative">
              <select
                value={settings.aspectRatio}
                onChange={e => setSettings({ ...settings, aspectRatio: e.target.value as AspectRatio })}
                className="w-full bg-slate-950/70 border border-slate-700/50 rounded-xl px-3 py-3.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 appearance-none cursor-pointer shadow-inner transition-all hover:border-slate-600"
              >
                {Object.values(AspectRatio).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="absolute right-3 top-3.5 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>

          {/* Export Format */}
          <div className="md:col-span-2 w-full space-y-2">
            <label className="text-xs font-bold text-amber-400 uppercase tracking-wider">Output Format</label>
            <div className="relative">
              <select
                value={settings.exportFormat}
                onChange={e => setSettings({ ...settings, exportFormat: e.target.value as ExportFormat })}
                className="w-full bg-slate-950/70 border border-slate-700/50 rounded-xl px-3 py-3.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 appearance-none cursor-pointer shadow-inner transition-all hover:border-slate-600"
              >
                <option value="image/jpeg">JPEG</option>
                <option value="image/png">PNG</option>
                <option value="image/webp">WebP</option>
              </select>
              <div className="absolute right-3 top-3.5 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>

          {/* Credit Tracker */}
          <div className="md:col-span-3 w-full flex items-center justify-end gap-3 pb-2 pl-4 border-l border-amber-900/30">
            <div className="flex flex-col items-end space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Session Usage</span>
                <span className="text-sm font-bold text-amber-400">{creditInfo.sessionGenerations} images</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Est. Cost</span>
                <span className="text-sm font-mono font-bold text-amber-500">${creditInfo.estimatedSessionCost.toFixed(2)}</span>
              </div>
              <a
                href="https://console.cloud.google.com/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-slate-600 hover:text-amber-400 transition-colors underline"
              >
                View Billing →
              </a>
            </div>
            <div className="flex flex-col items-center justify-center bg-gradient-to-br from-amber-500/20 to-amber-600/10 rounded-xl px-3 py-2 border border-amber-500/30">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-[9px] font-bold text-amber-400 mt-0.5">PRO 2K</span>
            </div>
          </div>
        </div>

        {/* CONTROLS & DROPZONE */}
        <div className="flex flex-col lg:flex-row gap-6 h-full min-h-[300px]">

          {/* Drop Zone */}
          <div
            className={`flex-grow border-2 border-dashed rounded-3xl transition-all duration-300 flex flex-col items-center justify-center py-12 cursor-pointer relative overflow-hidden group
                    ${isDragging ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/20' : 'border-slate-700/50 bg-gradient-to-br from-slate-900/30 to-slate-800/20 hover:bg-slate-800/30 hover:border-amber-600/40 hover:shadow-xl'}
                `}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="z-10 text-center space-y-4 pointer-events-none">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-800/60 to-slate-700/40 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform shadow-2xl border border-amber-500/20 group-hover:border-amber-500/50 group-hover:shadow-amber-500/20">
                <svg className={`w-10 h-10 ${isDragging ? 'text-amber-400' : 'text-slate-400 group-hover:text-amber-400'} transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white group-hover:text-amber-400 transition-colors tracking-tight">Upload Source Images</h3>
                <p className="text-sm text-slate-400 mt-2">Drag & drop or click to select files</p>
                <p className="text-xs text-slate-600 mt-1">Supports JPG, PNG, WebP</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" accept="image/*" onChange={e => addFiles(e.target.files)} />
          </div>

          {/* Bulk Actions Panel */}
          <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-3">
            <div className="bg-gradient-to-br from-slate-900/70 to-slate-800/40 border border-slate-700/50 rounded-3xl p-6 flex flex-col gap-4 h-full shadow-2xl">
              <div className="flex justify-between items-center border-b border-slate-700/50 pb-4">
                <span className="text-sm text-slate-300 font-semibold tracking-wide">Generation Queue</span>
                <span className="text-xs font-mono bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/30 font-bold">{items.length}</span>
              </div>

              <div className="flex-grow flex flex-col justify-center gap-3">
                <Button
                  onClick={processAll}
                  disabled={globalLoading || items.length === 0}
                  variant="primary"
                  isLoading={globalLoading}
                  className="w-full shadow-amber-500/30 shadow-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 font-semibold"
                >
                  Process All Images
                </Button>
                <Button
                  onClick={downloadAll}
                  disabled={items.filter(i => i.status === 'success').length === 0}
                  variant="secondary"
                  className="w-full font-semibold"
                >
                  Download as ZIP
                </Button>
              </div>

              <div className="pt-4 border-t border-slate-700/50 text-center">
                <button onClick={() => setItems([])} className="text-xs text-slate-500 hover:text-red-400 transition-colors font-medium">
                  Clear All Items
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* IMAGE GRID */}
        {items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
            {items.map(item => (
              <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col hover:border-slate-700 transition-all group">

                {/* Card Header: Status & Actions */}
                <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.status === 'success' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' :
                      item.status === 'error' ? 'bg-red-500' :
                        item.status === 'processing' ? 'bg-banana-500 animate-pulse' :
                          'bg-slate-600'
                      }`}></div>
                    <span className="text-xs font-mono text-slate-400 font-bold uppercase tracking-wider">{item.status}</span>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-red-500 transition-colors bg-slate-800/50 p-1.5 rounded-lg hover:bg-slate-800">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                {/* Content Area */}
                <div className="relative aspect-[4/3] bg-slate-950">
                  {/* Comparison View if Success */}
                  {item.status === 'success' && item.resultUrl ? (
                    <div className="relative w-full h-full flex">
                      <div className="w-1/2 h-full border-r border-slate-800 relative overflow-hidden group/img">
                        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-2 py-1 rounded-md text-[10px] text-slate-300 z-10 font-medium">Original</div>
                        <img src={item.previewUrl} className="w-full h-full object-cover" alt="Original" />
                      </div>
                      <div className="w-1/2 h-full relative overflow-hidden group/img">
                        <div className="absolute top-3 right-3 bg-banana-500/90 backdrop-blur px-2 py-1 rounded-md text-[10px] text-slate-900 font-bold z-10 shadow-lg">New</div>
                        <img src={item.resultUrl} className="w-full h-full object-cover" alt="Result" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full relative">
                      <img src={item.previewUrl} className={`w-full h-full object-cover transition-opacity duration-500 ${item.status === 'processing' ? 'opacity-30 blur-sm' : 'opacity-100'}`} alt="Preview" />
                      {item.status === 'processing' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin shadow-lg"></div>
                          <span className="text-xs text-amber-400 mt-3 font-mono animate-pulse font-medium">Generating...</span>
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="absolute inset-0 bg-red-900/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                          <div className="space-y-2">
                            <svg className="w-8 h-8 text-red-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-xs text-red-100 font-medium">{item.errorMessage}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Metadata Footer */}
                <div className="p-4 bg-slate-900 space-y-4">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono border-b border-slate-700/50 pb-4">
                    <div className="text-slate-500">
                      <span className="block text-slate-400 font-bold mb-1 tracking-wider">SOURCE</span>
                      {item.metadata.width} × {item.metadata.height}px <br />
                      {formatBytes(item.metadata.sizeBytes)}
                    </div>
                    {item.resultMetadata && (
                      <div className="text-right text-slate-500">
                        <span className="block text-amber-400 font-bold mb-1 tracking-wider">GENERATED</span>
                        {item.resultMetadata.width} × {item.resultMetadata.height}px <br />
                        {formatBytes(item.resultMetadata.sizeBytes)}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {item.status !== 'success' && item.status !== 'processing' && (
                      <Button size="sm" variant="secondary" onClick={() => processImage(item.id)} className="w-full font-semibold">
                        Generate Image
                      </Button>
                    )}
                    {item.status !== 'processing' && (
                      <Button size="sm" variant="secondary" onClick={() => removeTextVariant(item.id)} className="w-full font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
                        Remove Text
                      </Button>
                    )}
                    {item.status === 'success' && (
                      <Button size="sm" variant="primary" onClick={() => downloadItem(item)} className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 font-semibold">
                        Download {settings.exportFormat.split('/')[1].toUpperCase()}
                      </Button>
                    )}
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white p-4">
          <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-2xl max-w-md w-full">
            <h2 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h2>
            <p className="text-slate-300 mb-4">The application encountered a critical error.</p>
            <pre className="bg-black/50 p-3 rounded text-xs font-mono text-red-200 overflow-auto max-h-40">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}