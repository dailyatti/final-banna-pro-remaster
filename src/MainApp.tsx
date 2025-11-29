
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import i18next, { SUPPORTED_LANGUAGES } from './services/i18n';
import { Toaster, toast } from 'react-hot-toast';
import { Layers, PenTool, CopyCheck, BrainCircuit, Trash2, PlusSquare, Loader2, FileText, X, Wand2, Download, Check, Copy, ClipboardCopy } from 'lucide-react';

import { ImageUploader } from './components/ImageUploader';
import { ImageCard } from './components/ImageCard';
import { UserGuide } from './components/UserGuide';
import { ImageEditor } from './components/ImageEditor';
import { VoiceAssistant } from './components/VoiceAssistant';
import { CompositeModal } from './components/CompositeModal';
import { OCRSelectionModal } from './components/OCRSelectionModal';
import { TextToImageBar } from './components/TextToImageBar';
import { Header } from './components/Layout/Header';
import { Hero } from './components/Layout/Hero';
import { ApiKeyModal } from './components/Modals/ApiKeyModal';
import { useApiKey } from './context/ApiKeyContext';
import {
    ImageItem,
    OutputFormat,
    AiResolution,
    AspectRatio,
    NamingPattern,
    ProcessingStatus
} from './types';
import {
    convertImageFormat,
    convertUrlToBlob,
    fileToBase64,
    getImageDimensions
} from './services/imageUtils';
import { loadSessionImages, saveSessionImages } from './services/storageService';
import {
    processImageWithGemini,
    processGenerativeFill,
    processCompositeGeneration,
    extractTextFromImages,
    generateImageFromText
} from './services/geminiService';
const App: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { apiKey, isKeyValid } = useApiKey();

    useEffect(() => {
        console.log("BananaAI Remaster Build: 2025-11-29T13:25:00 - Auth Screen Removed");
    }, []);
    // const [isCheckingKey, setIsCheckingKey] = useState<boolean>(true); // Removed as context handles it

    const [images, setImages] = useState<ImageItem[]>([]);
    const [globalProcessing, setGlobalProcessing] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isRestored, setIsRestored] = useState(false);
    const [batchCompleteTrigger, setBatchCompleteTrigger] = useState(0);

    // Modals
    const [isCompositeModalOpen, setIsCompositeModalOpen] = useState(false);
    const [isOCRModalOpen, setIsOCRModalOpen] = useState(false);

    // Bulk settings
    const [bulkFormat, setBulkFormat] = useState<OutputFormat>(OutputFormat.JPG);
    const [bulkRes, setBulkRes] = useState<AiResolution>(AiResolution.RES_2K);
    const [bulkAspect, setBulkAspect] = useState<AspectRatio>(AspectRatio.SQUARE);
    const [globalPrompt, setGlobalPrompt] = useState<string>('');
    const [namingPattern, setNamingPattern] = useState<NamingPattern>(NamingPattern.ORIGINAL);

    // Native Gen State (Lifted)
    const [nativePrompt, setNativePrompt] = useState('');
    const [nativeConfig, setNativeConfig] = useState({
        format: OutputFormat.JPG,
        resolution: AiResolution.RES_2K,
        aspectRatio: AspectRatio.SQUARE
    });



    // UI States
    const [editingId, setEditingId] = useState<string | null>(null);
    const [ocrText, setOcrText] = useState<string | null>(null);
    const [isExtractingText, setIsExtractingText] = useState(false);
    const [isTextCopied, setIsTextCopied] = useState(false);

    const [isApplied, setIsApplied] = useState(false);
    const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
    const langMenuRef = useRef<HTMLDivElement>(null);
    const [isPromptFocused, setIsPromptFocused] = useState(false);
    const [isPasting, setIsPasting] = useState(false);

    const [isGeneratingNative, setIsGeneratingNative] = useState(false);
    const [isCompositeGenerating, setIsCompositeGenerating] = useState(false);


    // Load Session on Mount
    useEffect(() => {
        const init = async () => {
            try {
                const saved = await loadSessionImages();
                if (saved && saved.length > 0) {
                    setImages(saved);
                    toast.success(`Session restored: ${saved.length} images loaded.`, { id: 'session-restore', icon: '🔄', style: { borderRadius: '10px', background: '#333', color: '#fff' } });
                }
            } catch (e) {
                console.error("Failed to restore session", e);
            } finally {
                setIsRestored(true);
            }
        };
        if (isKeyValid) init();
    }, [isKeyValid]);

    // Auto-Save Session on Change
    useEffect(() => {
        if (isRestored && images.length > 0) {
            const timer = setTimeout(() => {
                saveSessionImages(images).catch(e => console.error("Auto-save failed", e));
            }, 1000); // Debounce save
            return () => clearTimeout(timer);
        }
    }, [images, isRestored]);


    // Close lang menu on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
                setIsLangMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Key check moved to ApiKeyContext
    /*
    useEffect(() => {
        const checkKey = async () => {
            try {
                if (window.aistudio && window.aistudio.hasSelectedApiKey) {
                    const has = await window.aistudio.hasSelectedApiKey();
                    setIsApiKeySet(has);
                } else if (process.env.API_KEY) {
                    setIsApiKeySet(true);
                }
            } catch (e) { console.error(e); } finally { setIsCheckingKey(false); }
        };
        checkKey();
    }, [setIsApiKeySet]);
    */

    const handleLanguageChange = (code: string) => {
        if (!code) return;

        // Normalize code if full name passed by AI
        let validCode = code.toLowerCase();
        if (validCode.includes('hungarian') || validCode.includes('magyar')) validCode = 'hu';
        else if (validCode.includes('english')) validCode = 'en';
        else if (validCode.includes('german')) validCode = 'de';

        // Check against supported list
        const isSupported = SUPPORTED_LANGUAGES.some(l => l.code === validCode);
        if (!isSupported) validCode = 'en'; // Fallback

        i18n.changeLanguage(validCode);
        localStorage.setItem('language', validCode);
        setIsLangMenuOpen(false);
        toast.success(`Language changed to ${validCode.toUpperCase()}`, { position: 'top-right', icon: '🌐', style: { borderRadius: '10px', background: '#333', color: '#fff' } });
    };

    const handleFilesSelected = useCallback(async (files: File[]) => {
        const newItems: ImageItem[] = [];
        const fileSignatures = new Map<string, number>();

        setImages(currentImages => {
            currentImages.forEach(img => {
                const sig = `${img.originalMeta.name}-${img.originalMeta.size}`;
                const count = fileSignatures.get(sig) || 0;
                fileSignatures.set(sig, count + 1);
            });
            return currentImages;
        });

        for (const file of files) {
            let width = 0;
            let height = 0;
            try {
                const dims = await getImageDimensions(file);
                width = dims.width;
                height = dims.height;
            } catch (e) {
                console.warn("Could not extract image dimensions, using defaults", e);
            }

            const sig = `${file.name}-${file.size}`;
            const existingCount = fileSignatures.get(sig) || 0;
            fileSignatures.set(sig, existingCount + 1);

            const duplicateIndex = existingCount > 0 ? existingCount + 1 : undefined;

            const id = uuidv4();
            newItems.push({
                id,
                file,
                previewUrl: URL.createObjectURL(file),
                originalMeta: { name: file.name, size: file.size, width: width, height: height, type: file.type },
                targetFormat: bulkFormat,
                targetResolution: bulkRes,
                targetAspectRatio: bulkAspect,
                userPrompt: globalPrompt,
                status: ProcessingStatus.IDLE,
                duplicateIndex: duplicateIndex
            });
        }
        setImages(prev => [...prev, ...newItems]);
        toast.success(`${files.length} assets imported`, { id: 'import-success', style: { borderRadius: '10px', background: '#333', color: '#fff' } });
    }, [bulkFormat, bulkRes, bulkAspect, globalPrompt]);

    // Global Paste Listener
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const clipboardItems = e.clipboardData?.items;
            if (!clipboardItems) return;

            const pastedFiles: File[] = [];
            let hasImage = false;

            for (let i = 0; i < clipboardItems.length; i++) {
                const item = clipboardItems[i];
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) {
                        hasImage = true;
                        const fileName = blob.name === 'image.png'
                            ? `clipboard_${Date.now()}.${blob.type.split('/')[1]}`
                            : blob.name;
                        const file = new File([blob], fileName, { type: blob.type });
                        pastedFiles.push(file);
                    }
                }
            }

            if (pastedFiles.length > 0) {
                e.preventDefault();
                setIsPasting(true);
                setTimeout(() => setIsPasting(false), 800);
                handleFilesSelected(pastedFiles);
            }
        };

        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [handleFilesSelected]);


    const updateConfig = (id: string, updates: Partial<ImageItem>) => {
        setImages(prev => prev.map(img => {
            if (img.id === id) {
                let newStatus = img.status;
                if (img.status === ProcessingStatus.SUCCESS) {
                    newStatus = ProcessingStatus.IDLE;
                }
                return { ...img, ...updates, status: newStatus };
            }
            return img;
        }));
    };

    const removeImage = (id: string) => {
        setImages(prev => prev.filter(img => img.id !== id));
        toast('Asset removed', { icon: '🗑️', style: { borderRadius: '10px', background: '#333', color: '#fff' } });
    };

    const clearQueue = async () => {
        if (images.length === 0) return;
        setImages([]);
        try {
            await saveSessionImages([]);
            toast('Queue cleared', { icon: '🗑️', style: { borderRadius: '10px', background: '#333', color: '#fff' } });
        } catch (e) {
            console.error("Clear queue error", e);
        }
    };



    const handleMultiVariant = (id: string, type: 'RATIOS' | 'FORMATS' | 'VARIANTS') => {
        const originalItem = images.find(i => i.id === id);
        if (!originalItem) return;

        const newVariants: ImageItem[] = [];
        const baseIndex = originalItem.duplicateIndex || 1;

        if (type === 'RATIOS') {
            const ratios = [AspectRatio.SQUARE, AspectRatio.LANDSCAPE, AspectRatio.PORTRAIT];
            ratios.forEach((r, idx) => {
                newVariants.push({
                    ...originalItem,
                    id: uuidv4(),
                    targetAspectRatio: r,
                    status: ProcessingStatus.IDLE,
                    duplicateIndex: baseIndex + (idx + 1),
                    originalMeta: { ...originalItem.originalMeta, name: `${originalItem.originalMeta.name} (${r})` }
                });
            });
        } else if (type === 'FORMATS') {
            const formats = [OutputFormat.JPG, OutputFormat.PNG, OutputFormat.WEBP];
            formats.forEach((f, idx) => {
                newVariants.push({
                    ...originalItem,
                    id: uuidv4(),
                    targetFormat: f,
                    status: ProcessingStatus.IDLE,
                    duplicateIndex: baseIndex + (idx + 1),
                    originalMeta: { ...originalItem.originalMeta, name: `${originalItem.originalMeta.name} (${f.split('/')[1].toUpperCase()})` }
                });
            });
        } else if (type === 'VARIANTS') {
            for (let i = 0; i < 3; i++) {
                newVariants.push({
                    ...originalItem,
                    id: uuidv4(),
                    status: ProcessingStatus.IDLE,
                    duplicateIndex: baseIndex + (i + 1),
                    originalMeta: { ...originalItem.originalMeta, name: `${originalItem.originalMeta.name} (Var ${i + 1})` }
                });
            }
        }

        setImages(prev => {
            const index = prev.findIndex(i => i.id === id);
            const newArr = [...prev];
            newArr.splice(index + 1, 0, ...newVariants);
            return newArr;
        });
        toast.success(`Created ${newVariants.length} queued variants`, { style: { borderRadius: '10px', background: '#333', color: '#fff' } });
    };

    const processSingleImage = async (id: string, overridePrompt?: string) => {
        const originalItem = images.find(i => i.id === id);
        if (!originalItem) return;

        if (!apiKey) {
            toast.error("Please enter your API Key first.");
            return;
        }

        const variantId = uuidv4();
        const variantItem: ImageItem = {
            ...originalItem,
            id: variantId,
            status: ProcessingStatus.PROCESSING,
            duplicateIndex: (originalItem.duplicateIndex || 1) + 1,
            originalMeta: { ...originalItem.originalMeta, name: `${originalItem.originalMeta.name} (Processed)` },
            userPrompt: overridePrompt || originalItem.userPrompt // Use override prompt if provided
        };

        setImages(prev => {
            const index = prev.findIndex(i => i.id === id);
            const newArr = [...prev];
            newArr.splice(index + 1, 0, variantItem);
            return newArr;
        });

        try {
            const result = await processImageWithGemini(apiKey, variantItem);

            setImages(prev => prev.map(img => {
                if (img.id === variantId) {
                    return {
                        ...img,
                        status: ProcessingStatus.SUCCESS,
                        processedUrl: result.processedUrl,
                        processedMeta: {
                            name: `remastered_${img.originalMeta.name}`,
                            size: result.size,
                            width: result.width,
                            height: result.height,
                            type: img.targetFormat
                        }
                    };
                }
                return img;
            }));
            toast.success(`Variant created successfully!`, { style: { borderRadius: '10px', background: '#333', color: '#fff' } });
        } catch (error: any) {
            setImages(prev => prev.map(img => img.id === variantId ? { ...img, status: ProcessingStatus.ERROR, errorMessage: error.message } : img));
            toast.error(`Processing failed: ${error.message}`, { style: { borderRadius: '10px', background: '#333', color: '#fff' } });
        }
    };

    const handleNativeGen = async (overridePrompt?: string, overrideConfig?: any) => {
        // ATOMIC EXECUTION: Prioritize override values (from voice) ONLY if they are not empty
        const finalPrompt = (overridePrompt && overridePrompt.trim()) ? overridePrompt : nativePrompt;
        const finalConfig = overrideConfig || nativeConfig;

        if (!finalPrompt || !finalPrompt.trim()) {
            toast.error("Prompt cannot be empty");
            return;
        }

        if (!apiKey) {
            toast.error("API Key missing");
            setIsGeneratingNative(false);
            return;
        }

        setIsGeneratingNative(true);

        // Sync visual state if driven by voice
        if (overridePrompt) setNativePrompt(overridePrompt);
        if (overrideConfig) setNativeConfig(prev => ({ ...prev, ...overrideConfig }));

        // Show feedback
        toast("Generating...", { icon: '🎨', duration: 2000, style: { borderRadius: '10px', background: '#333', color: '#fff' } });

        const tempId = uuidv4();
        const placeholder: ImageItem = {
            id: tempId,
            file: new File([], 'native_gen', { type: 'image/png' }),
            previewUrl: '',
            originalMeta: { name: 'AI Generated Asset', size: 0, width: 0, height: 0, type: 'image/png' },
            targetFormat: finalConfig.format,
            targetResolution: finalConfig.resolution,
            targetAspectRatio: finalConfig.aspectRatio,
            userPrompt: finalPrompt,
            status: ProcessingStatus.PROCESSING
        };

        setImages(prev => [placeholder, ...prev]);

        try {
            const result = await generateImageFromText(apiKey, finalPrompt, finalConfig);
            const resp = await fetch(result.processedUrl);
            const blob = await resp.blob();
            const file = new File([blob], `ai_gen_${Date.now()}.png`, { type: 'image/png' });

            setImages(prev => prev.map(img => {
                if (img.id === tempId) {
                    return {
                        ...img,
                        file: file,
                        previewUrl: result.processedUrl,
                        processedUrl: result.processedUrl,
                        status: ProcessingStatus.SUCCESS,
                        originalMeta: { name: `AI_Gen_${Date.now()}`, size: result.size, width: result.width, height: result.height, type: 'image/png' },
                        processedMeta: { name: `AI_Gen_${Date.now()}`, size: result.size, width: result.width, height: result.height, type: 'image/png' }
                    };
                }
                return img;
            }));
            toast.success("Image generated successfully!");
            // Keep prompt in box for reference
        } catch (e: any) {
            setImages(prev => prev.filter(img => img.id !== tempId));
            toast.error("Generation failed: " + e.message);
        } finally {
            setIsGeneratingNative(false);
        }
    };

    const processAll = async () => {
        const itemsToProcess = images.filter(i => i.status === ProcessingStatus.IDLE);
        if (itemsToProcess.length === 0) {
            toast('No pending items to process', { icon: 'ℹ️', style: { borderRadius: '10px', background: '#333', color: '#fff' } });
            return;
        }

        setGlobalProcessing(true);
        toast.loading(`Starting batch queue (${itemsToProcess.length} items)...`, { id: 'batch-queue', duration: 2000, style: { borderRadius: '10px', background: '#333', color: '#fff' } });

        const promises = itemsToProcess.map(img => processSingleImage(img.id));
        await Promise.all(promises);

        setGlobalProcessing(false);
        toast.dismiss('batch-queue');
        toast.success('Batch processing complete!', { style: { borderRadius: '10px', background: '#333', color: '#fff' } });
        setBatchCompleteTrigger(prev => prev + 1);
    };

    const openCompositeModal = () => setIsCompositeModalOpen(true);

    const runCompositeGeneration = async (selectedIds: string[], prompt: string, config: any) => {
        setIsCompositeModalOpen(false);
        const compositeId = uuidv4();
        const selectedImages = images.filter(img => selectedIds.includes(img.id));
        if (selectedImages.length < 1) {
            toast.error("Select at least one image");
            return;
        }
        const placeholder: ImageItem = {
            id: compositeId,
            file: new File([], 'composite_gen', { type: 'image/png' }),
            previewUrl: '',
            originalMeta: { name: 'Composite Generation', size: 0, width: 0, height: 0, type: 'image/png' },
            targetFormat: config.format,
            targetResolution: config.resolution,
            targetAspectRatio: config.aspectRatio,
            userPrompt: prompt || globalPrompt,
            status: ProcessingStatus.PROCESSING
        };
        setImages(prev => [placeholder, ...prev]);
        const toastId = toast.loading('Generating composite...', { id: 'composite-gen', style: { borderRadius: '10px', background: '#333', color: '#fff' } });

        if (!apiKey) {
            toast.error("API Key required");
            setIsCompositeGenerating(false);
            return;
        }
        setIsCompositeGenerating(true);
        try {
            const result = await processCompositeGeneration(apiKey, selectedImages, prompt || globalPrompt, config);
            setImages(prev => prev.map(img => {
                if (img.id === compositeId) {
                    return {
                        ...img,
                        status: ProcessingStatus.SUCCESS,
                        previewUrl: result.processedUrl,
                        processedUrl: result.processedUrl,
                        processedMeta: {
                            name: `Composite_${Date.now()}`,
                            size: result.size,
                            width: result.width,
                            height: result.height,
                            type: config.format
                        }
                    };
                }
                return img;
            }));
            toast.dismiss(toastId);
            toast.success('Composite generated!');
        } catch (e: any) {
            setImages(prev => prev.map(img => img.id === compositeId ? { ...img, status: ProcessingStatus.ERROR, errorMessage: e.message } : img));
            toast.dismiss(toastId);
            toast.error('Composite failed');
        } finally {
            setIsCompositeGenerating(false);
        }
    };

    const openOCRModal = () => {
        if (images.length === 0) return;
        setIsOCRModalOpen(true);
    };

    const runOCR = async (selectedIds: string[]) => {
        setIsOCRModalOpen(false);
        const selectedImages = images.filter(img => selectedIds.includes(img.id));
        if (selectedImages.length === 0) return;
        setIsExtractingText(true);
        const toastId = toast.loading('Analyzing text structure...', { style: { borderRadius: '10px', background: '#333', color: '#fff' } });
        if (!apiKey) {
            toast.error("API Key required for OCR.");
            setIsExtractingText(false);
            toast.dismiss(toastId);
            return;
        }
        const text = await extractTextFromImages(apiKey, selectedImages);
        setOcrText(text);
        setIsExtractingText(false);
        toast.dismiss(toastId);
        toast.success('Text extraction complete');
    };

    const copyOcrToClipboard = () => {
        if (ocrText) {
            navigator.clipboard.writeText(ocrText);
            setIsTextCopied(true);
            toast.success('Copied to clipboard');
            setTimeout(() => setIsTextCopied(false), 2000);
        }
    };

    const applyBulkSettings = () => {
        setImages(prev => prev.map(img => ({ ...img, targetFormat: bulkFormat, targetResolution: bulkRes, targetAspectRatio: bulkAspect, userPrompt: globalPrompt || img.userPrompt })));
        setIsApplied(true);
        toast.success('Global settings applied to all items');
        setTimeout(() => setIsApplied(false), 1500);
    };

    // Modals State
    const [modals, setModals] = useState({
        composite: false,
        ocr: false,
        guide: false,
        langMenu: false
    });

    // Composite State (Lifted for Voice Control)
    const [compositeConfig, setCompositeConfig] = useState({
        prompt: '',
        format: OutputFormat.JPG,
        resolution: AiResolution.RES_2K,
        aspectRatio: AspectRatio.SQUARE
    });

    // --- CENTRAL VOICE COMMAND DISPATCHER ---
    const handleVoiceCommand = (cmd: any) => {
        // 0. SCROLL ACTION
        if (cmd.scrollAction) {
            const direction = cmd.scrollAction;
            if (direction === 'TOP') window.scrollTo({ top: 0, behavior: 'smooth' });
            if (direction === 'BOTTOM') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            if (direction === 'UP') window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
            if (direction === 'DOWN') window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
            return;
        }

        // 1. TRIGGER NATIVE GEN (ATOMIC)
        if (cmd.triggerNative) {
            // CRITICAL FIX: Do not trigger native gen if Composite Modal is open
            if (modals.composite) {
                toast.error("Please close the Composite Generator first.");
                return;
            }

            const configOverride: any = {};
            if (cmd.aspectRatio) configOverride.aspectRatio = cmd.aspectRatio;
            if (cmd.resolution) configOverride.resolution = cmd.resolution;
            if (cmd.format) {
                if (cmd.format === 'JPG') configOverride.format = OutputFormat.JPG;
                if (cmd.format === 'PNG') configOverride.format = OutputFormat.PNG;
                if (cmd.format === 'WEBP') configOverride.format = OutputFormat.WEBP;
            }
            handleNativeGen(cmd.prompt, Object.keys(configOverride).length ? configOverride : undefined);
            return;
        }

        // 1.5 TRIGGER COMPOSITE GEN (NEW)
        if (cmd.triggerComposite) {
            // Select all images if none selected (simplified logic for voice)
            // In a real scenario, we might need a selection state. 
            // For now, let's assume "all images" or "currently visible".
            // But runCompositeGeneration takes IDs.
            const allIds = images.map(i => i.id);
            const config = {
                format: cmd.format === 'PNG' ? OutputFormat.PNG : (cmd.format === 'WEBP' ? OutputFormat.WEBP : OutputFormat.JPG),
                resolution: cmd.resolution === '4K' ? AiResolution.RES_4K : (cmd.resolution === '1K' ? AiResolution.RES_1K : AiResolution.RES_2K),
                aspectRatio: cmd.aspectRatio || AspectRatio.SQUARE
            };
            runCompositeGeneration(allIds, cmd.prompt, config);
            return;
        }

        // 2. UNIVERSAL ITEM ACTION (NEW)
        if (cmd.itemAction && cmd.targetIndex) {
            const idx = parseInt(cmd.targetIndex) - 1;
            if (idx >= 0 && idx < images.length) {
                const targetId = images[idx].id;
                switch (cmd.itemAction) {
                    case 'REMOVE': removeImage(targetId); break;
                    case 'EDIT': setEditingId(targetId); break;
                    case 'DOWNLOAD':
                        // Trigger download for specific item
                        const link = document.createElement('a');
                        const item = images[idx];
                        if (item.processedUrl) {
                            link.href = item.processedUrl;
                            link.download = `download_${item.id}.${item.targetFormat.split('/')[1]}`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            toast.success(`Downloading item ${cmd.targetIndex}`);
                        } else {
                            toast.error(`Item ${cmd.targetIndex} is not ready.`);
                        }
                        break;
                    case 'REMASTER': processSingleImage(targetId); break;
                    case 'CREATE_VARIANTS': handleMultiVariant(targetId, 'VARIANTS'); break;
                    case 'SHARE':
                        // Share logic for specific item
                        const shareItem = images[idx];
                        if (shareItem.processedUrl) {
                            fetch(shareItem.processedUrl)
                                .then(r => r.blob())
                                .then(blob => {
                                    const ext = shareItem.targetFormat.split('/')[1];
                                    const file = new File([blob], `image.${ext}`, { type: shareItem.targetFormat });
                                    if (navigator.share && navigator.canShare({ files: [file] })) {
                                        navigator.share({ files: [file] });
                                    } else {
                                        toast.success('Copied to clipboard (Share not supported on this device)');
                                        const ci = new ClipboardItem({ [shareItem.targetFormat]: blob });
                                        navigator.clipboard.write([ci]);
                                    }
                                });
                        }
                        break;
                }
            } else {
                toast.error(`Item ${cmd.targetIndex} not found.`);
            }
            return;
        }

        // 3. UI ACTIONS
        if (cmd.uiAction) {
            switch (cmd.uiAction) {
                case 'CHANGE_LANG': handleLanguageChange(cmd.value); break;
                case 'OPEN_LANG_MENU': setIsLangMenuOpen(true); break;
                case 'OPEN_COMPOSITE': setIsCompositeModalOpen(true); break;
                case 'OPEN_OCR': openOCRModal(); break;
                case 'OPEN_DOCS': setIsGuideOpen(true); break;
                case 'CLOSE_MODAL':
                case 'CLOSE_COMPOSITE': setIsCompositeModalOpen(false); break;
                case 'CLOSE_OCR': setIsOCRModalOpen(false); break;
                case 'CLOSE_DOCS': setIsGuideOpen(false); break;
                case 'CLOSE_ALL':
                    setIsCompositeModalOpen(false);
                    setIsOCRModalOpen(false);
                    setIsGuideOpen(false);
                    setIsLangMenuOpen(false);
                    setEditingId(null);
                    break;
            }
            return;
        }

        // 4. GLOBAL CONFIG ACTIONS
        if (cmd.setGlobalConfig) {
            if (cmd.setGlobalConfig.format) {
                const fmt = cmd.setGlobalConfig.format;
                if (fmt === 'JPG') setBulkFormat(OutputFormat.JPG);
                if (fmt === 'PNG') setBulkFormat(OutputFormat.PNG);
                if (fmt === 'WEBP') setBulkFormat(OutputFormat.WEBP);
            }
            if (cmd.setGlobalConfig.resolution) {
                const res = cmd.setGlobalConfig.resolution;
                if (res === '1K') setBulkRes(AiResolution.RES_1K);
                if (res === '2K') setBulkRes(AiResolution.RES_2K);
                if (res === '4K') setBulkRes(AiResolution.RES_4K);
            }
            if (cmd.setGlobalConfig.aspectRatio) {
                const ar = cmd.setGlobalConfig.aspectRatio;
                if (ar === '1:1') setBulkAspect(AspectRatio.SQUARE);
                if (ar === '16:9') setBulkAspect(AspectRatio.LANDSCAPE);
                if (ar === '9:16') setBulkAspect(AspectRatio.PORTRAIT);
                if (ar === '4:3') setBulkAspect(AspectRatio.STANDARD_LANDSCAPE);
                if (ar === '3:4') setBulkAspect(AspectRatio.STANDARD_PORTRAIT);
            }
            toast.success("Global configuration updated via Voice.");
            return;
        }

        // 4. GLOBAL QUEUE ACTIONS
        if (cmd.queueAction) {
            switch (cmd.queueAction) {
                case 'CLEAR_ALL': clearQueue(); break;
                case 'DOWNLOAD_ZIP': handleSmartDownload('ALL'); break;
                case 'DOWNLOAD_UPLOADED': handleSmartDownload('UPLOADED'); break;
                case 'DOWNLOAD_GENERATED': handleSmartDownload('GENERATED'); break;
                case 'DOWNLOAD_SELECTED': handleSmartDownload('SELECTED', selectedIds); break;
            }
            return;
        }

        // 5. NATIVE INPUT UPDATE
        if (cmd.updateNative) {
            if (cmd.prompt) {
                setNativePrompt(cmd.prompt);
                toast("AI Typing...", { icon: '⌨️', duration: 1000, style: { borderRadius: '10px', background: '#333', color: '#fff' } });
            }
            if (cmd.aspectRatio) setNativeConfig(prev => ({ ...prev, aspectRatio: cmd.aspectRatio }));
            if (cmd.resolution) setNativeConfig(prev => ({ ...prev, resolution: cmd.resolution }));
            if (cmd.format) {
                if (cmd.format === 'JPG') setNativeConfig(prev => ({ ...prev, format: OutputFormat.JPG }));
                if (cmd.format === 'PNG') setNativeConfig(prev => ({ ...prev, format: OutputFormat.PNG }));
                if (cmd.format === 'WEBP') setNativeConfig(prev => ({ ...prev, format: OutputFormat.WEBP }));
            }
            return;
        }

        // 6. COMPOSITE CONFIG UPDATE
        if (cmd.compositeAction) {
            if (cmd.prompt) setCompositeConfig(prev => ({ ...prev, prompt: cmd.prompt }));
            if (cmd.aspectRatio) setCompositeConfig(prev => ({ ...prev, aspectRatio: cmd.aspectRatio }));
            if (cmd.resolution) setCompositeConfig(prev => ({ ...prev, resolution: cmd.resolution }));
            if (cmd.format) {
                if (cmd.format === 'JPG') setCompositeConfig(prev => ({ ...prev, format: OutputFormat.JPG }));
                if (cmd.format === 'PNG') setCompositeConfig(prev => ({ ...prev, format: OutputFormat.PNG }));
                if (cmd.format === 'WEBP') setCompositeConfig(prev => ({ ...prev, format: OutputFormat.WEBP }));
            }
            return;
        }

        // 7. LEGACY DASHBOARD UPDATE (For general 'update image 1' commands)
        const targetIndex = cmd.targetIndex ? parseInt(cmd.targetIndex) : 0;
        if (cmd.startQueue) { processAll(); return; }

        setImages(prevImages => {
            return prevImages.map((img, index) => {
                const isTarget = targetIndex === 0 || (index + 1) === targetIndex;
                if (!isTarget) return img;
                let updates: Partial<ImageItem> = {};
                if (cmd.aspectRatio) updates.targetAspectRatio = cmd.aspectRatio;
                if (cmd.resolution) updates.targetResolution = cmd.resolution;
                if (cmd.prompt) updates.userPrompt = cmd.prompt;
                if (cmd.format) {
                    if (cmd.format === 'JPG') updates.targetFormat = OutputFormat.JPG;
                    if (cmd.format === 'PNG') updates.targetFormat = OutputFormat.PNG;
                    if (cmd.format === 'WEBP') updates.targetFormat = OutputFormat.WEBP;
                }
                return { ...img, ...updates };
            });
        });

        if (targetIndex === 0) {
            if (cmd.aspectRatio) setBulkAspect(cmd.aspectRatio);
            if (cmd.resolution) setBulkRes(cmd.resolution);
            if (cmd.prompt) setGlobalPrompt(cmd.prompt);
            if (cmd.format) {
                if (cmd.format === 'JPG') setBulkFormat(OutputFormat.JPG);
                if (cmd.format === 'PNG') setBulkFormat(OutputFormat.PNG);
                if (cmd.format === 'WEBP') setBulkFormat(OutputFormat.WEBP);
            }
        }
    };

    const handleEditorSave = (newUrl: string, newBlob: Blob) => {
        if (!editingId) return;
        const originalItem = images.find(i => i.id === editingId);
        if (!originalItem) return;
        const variantId = uuidv4();
        const newItem: ImageItem = {
            ...originalItem,
            id: variantId,
            file: new File([newBlob], originalItem.originalMeta.name, { type: originalItem.originalMeta.type }),
            previewUrl: newUrl,
            status: ProcessingStatus.IDLE,
            duplicateIndex: (originalItem.duplicateIndex || 1) + 1
        };
        setImages(prev => {
            const index = prev.findIndex(i => i.id === editingId);
            const newArr = [...prev];
            newArr.splice(index + 1, 0, newItem);
            return newArr;
        });
        setEditingId(null);
        toast.success('Edited version saved as variant');
    };

    const handleGenerativeFill = async (blob: Blob, customPrompt?: string): Promise<string> => {
        const toastId = toast.loading(customPrompt ? 'Magic Editing...' : 'Expanding Canvas...');
        try {
            if (!apiKey) {
                toast.error("API Key required.");
                toast.dismiss(toastId);
                throw new Error("API Key missing");
            }
            const result = await processGenerativeFill(apiKey, blob, OutputFormat.PNG, customPrompt);
            toast.dismiss(toastId);
            toast.success(customPrompt ? 'Edit Complete!' : 'Outpainting Complete!');
            return result.processedUrl;
        } catch (e: any) {
            toast.dismiss(toastId);
            toast.error('Operation Failed');
            throw e;
        }
    };

    const downloadAllProcessed = async () => {
        const processedImages = images.filter(img => img.status === ProcessingStatus.SUCCESS && img.processedUrl);
        if (processedImages.length === 0) {
            toast.error("No finished images to download.");
            return;
        }
        toast.loading('Zipping files...', { id: 'zip-download' });
        const zip = new JSZip();

        // Use Promise.all to handle async conversions
        await Promise.all(processedImages.map(async (img, index) => {
            if (img.processedUrl) {
                let name = img.originalMeta.name.split('.')[0];
                if (img.customOutputName) name = img.customOutputName;
                if (namingPattern === NamingPattern.RANDOM_ID) name = uuidv4().slice(0, 8);
                if (namingPattern === NamingPattern.SEQUENTIAL_PREFIX) name = `${String(index + 1).padStart(2, '0')}_${name}`;
                if (namingPattern === NamingPattern.SEQUENTIAL_SUFFIX) name = `${name}_${String(index + 1).padStart(2, '0')}`;

                const ext = img.targetFormat.split('/')[1];
                // Use convertUrlToBlob to ensure correct format
                try {
                    const blob = await convertUrlToBlob(img.processedUrl, img.targetFormat);
                    zip.file(`${name}.${ext}`, blob);
                } catch (e) {
                    console.error(`Failed to convert/download ${name}`, e);
                    // Fallback to direct fetch if conversion fails
                    zip.file(`${name}.${ext}`, fetch(img.processedUrl).then(r => r.blob()));
                }
            }
        }));

        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `BananaAI_Export_${new Date().getTime()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.dismiss('zip-download');
        toast.success('Download started');
    };

    // --- NEW: SELECTION & QUICK ACTIONS ---
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const handleSelectionToggle = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleQuickRemoveText = async (id: string) => {
        const item = images.find(i => i.id === id);
        if (!item) return;

        // Simplified prompt as requested by user - this worked best in previous versions
        const enhancedPrompt = "töröld az írást";

        // Use standard processing flow with override prompt
        // This ensures UI feedback (loading spinners, status updates) works exactly like standard generation
        await processSingleImage(id, enhancedPrompt);
    };

    const downloadSelected = async () => {
        if (selectedIds.length === 0) {
            toast.error("No images selected");
            return;
        }

        toast.loading(`Preparing ${selectedIds.length} images...`, { id: 'dl-selected' });
        const zip = new JSZip();

        await Promise.all(selectedIds.map(async (id) => {
            const img = images.find(i => i.id === id);
            if (!img) return;

            // Determine source URL (processed or preview/original)
            const url = img.processedUrl || img.previewUrl;
            if (!url) return;

            let name = img.originalMeta.name.split('.')[0];
            if (img.customOutputName) name = img.customOutputName;
            // Add unique suffix if multiple selected to avoid collision? JSZip handles overwrite, but better to be safe.
            // Actually, let's keep original names unless collision.

            const ext = img.targetFormat.split('/')[1];
            try {
                const blob = await convertUrlToBlob(url, img.targetFormat);
                zip.file(`${name}_${id.slice(0, 4)}.${ext}`, blob);
            } catch (e) {
                console.error(`Failed to process ${name}`, e);
            }
        }));

        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `BananaAI_Selected_${new Date().getTime()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.dismiss('dl-selected');
        toast.success("Download ready");
    };

    const deleteSelected = () => {
        if (selectedIds.length === 0) {
            toast.error("No images selected");
            return;
        }

        const count = selectedIds.length;
        setImages(prev => prev.filter(img => !selectedIds.includes(img.id)));
        toast.success(`Deleted ${count} images`);
        setSelectedIds([]);
    };

    const selectAll = () => {
        setSelectedIds(images.map(img => img.id));
        toast.success(`Selected ${images.length} images`);
    };

    const deselectAll = () => {
        setSelectedIds([]);
        toast('Selection cleared');
    };

    const handleSmartDownload = async (filter: 'ALL' | 'UPLOADED' | 'GENERATED' | 'SELECTED', specificIds?: string[]) => {
        let targets: ImageItem[] = [];

        switch (filter) {
            case 'ALL':
                targets = images;
                break;
            case 'UPLOADED':
                targets = images.filter(img => !img.processedUrl);
                break;
            case 'GENERATED':
                targets = images.filter(img => img.processedUrl);
                break;
            case 'SELECTED':
                targets = images.filter(img => (specificIds || selectedIds).includes(img.id));
                break;
        }

        if (targets.length === 0) {
            toast.error("No images found for this selection");
            return;
        }

        toast.loading(`Preparing ${targets.length} files...`, { id: 'smart-download' });
        const zip = new JSZip();
        let successCount = 0;

        try {
            await Promise.all(targets.map(async (img, index) => {
                try {
                    let blob: Blob;
                    let ext = img.targetFormat.split('/')[1];

                    // 1. If it has a processed URL, download it directly
                    if (img.processedUrl) {
                        blob = await convertUrlToBlob(img.processedUrl, img.targetFormat);
                    }
                    // 2. If it's an uploaded original (no processedUrl), convert it
                    else if (img.previewUrl) {
                        let base64: string;
                        let mimeType = img.originalMeta.type;

                        if (img.file) {
                            base64 = await fileToBase64(img.file);
                        } else {
                            const resp = await fetch(img.previewUrl);
                            const blob = await resp.blob();
                            base64 = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                                reader.readAsDataURL(blob);
                            });
                            mimeType = blob.type;
                        }

                        const conversion = await convertImageFormat(base64, img.targetFormat, mimeType);
                        blob = conversion.blob;
                    } else {
                        return; // Skip invalid
                    }

                    // Naming logic
                    let name = img.originalMeta.name.split('.')[0];
                    if (img.customOutputName) name = img.customOutputName;

                    // Add index/ID to avoid collisions in bulk
                    if (targets.length > 1) {
                        name = `${name}_${img.id.slice(0, 4)}`;
                    }

                    zip.file(`${name}.${ext}`, blob);
                    successCount++;
                } catch (e) {
                    console.error(`Failed to process ${img.id}`, e);
                }
            }));

            if (successCount === 0) {
                throw new Error("No files could be prepared");
            }

            // If single file, download directly? Or always zip for consistency?
            // User asked for bulk download logic, usually implies zip. 
            // But if single file selected, zip might be annoying.
            if (targets.length === 1) {
                const content = await zip.file(Object.keys(zip.files)[0])?.async("blob");
                if (content) {
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(content);
                    link.download = Object.keys(zip.files)[0];
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            } else {
                const content = await zip.generateAsync({ type: "blob" });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(content);
                link.download = `BananaAI_Download_${new Date().getTime()}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            toast.dismiss('smart-download');
            toast.success(`Downloaded ${successCount} files`);

        } catch (error) {
            console.error("Smart download failed", error);
            toast.dismiss('smart-download');
            toast.error("Download failed");
        }
    };
    const originalCount = images.filter(i => !i.duplicateIndex || i.duplicateIndex === 1).length;
    const variantCount = images.filter(i => i.duplicateIndex && i.duplicateIndex > 1).length;

    // if (isCheckingKey) return <div className="min-h-screen bg-[#020617] flex items-center justify-center"><Loader2 className="w-10 h-10 text-emerald-500 animate-spin" /></div>;

    return (
        <div className="min-h-screen text-slate-200 font-sans selection:bg-emerald-500/30 pb-20">
            <Toaster position="bottom-center" />

            <AnimatePresence>
                {isPasting && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-emerald-500/20 backdrop-blur-sm pointer-events-none flex items-center justify-center">
                        <div className="bg-slate-900/90 border border-emerald-500/50 px-8 py-4 rounded-2xl flex items-center gap-4 shadow-2xl transform scale-125">
                            <ClipboardCopy className="w-8 h-8 text-emerald-400" />
                            <span className="text-xl font-bold text-white tracking-wide">Image Pasted!</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <UserGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
            <AnimatePresence>
                {isCompositeModalOpen && (
                    <CompositeModal
                        isOpen={isCompositeModalOpen}
                        onClose={() => setIsCompositeModalOpen(false)}
                        images={images}
                        onGenerate={runCompositeGeneration}
                        config={compositeConfig}
                        onConfigChange={setCompositeConfig}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>{isOCRModalOpen && (<OCRSelectionModal isOpen={isOCRModalOpen} onClose={() => setIsOCRModalOpen(false)} images={images} onExtract={runOCR} />)}</AnimatePresence>
            <AnimatePresence>{editingId && (<ImageEditor imageUrl={images.find(i => i.id === editingId)?.previewUrl || ''} onSave={handleEditorSave} onClose={() => setEditingId(null)} onGenerativeFill={handleGenerativeFill} onRemoveText={() => { handleQuickRemoveText(editingId); setEditingId(null); }} />)}</AnimatePresence>

            <VoiceAssistant
                apiKey={apiKey}
                onCommand={handleVoiceCommand}
                onAudit={() => setIsOCRModalOpen(true)}
                onApplyAll={applyBulkSettings}
                currentLanguage={i18n.language}
                images={images}
                batchCompleteTrigger={batchCompleteTrigger}
                nativePrompt={nativePrompt}
                isNativeGenerating={isGeneratingNative}
                modalsState={{ composite: isCompositeModalOpen, ocr: isOCRModalOpen, guide: isGuideOpen, langMenu: isLangMenuOpen }}
            />

            <ApiKeyModal />

            <Header
                onOpenDocs={() => setIsGuideOpen(true)}
                isLangMenuOpen={isLangMenuOpen}
                setIsLangMenuOpen={setIsLangMenuOpen}
                onLanguageChange={handleLanguageChange}
            />

            <main className="max-w-[1800px] mx-auto px-4 sm:px-6 py-10 min-h-screen">
                <Hero />

                <ImageUploader onFilesSelected={handleFilesSelected} />
                <TextToImageBar
                    prompt={nativePrompt}
                    config={nativeConfig}
                    onPromptChange={setNativePrompt}
                    onConfigChange={(key, val) => setNativeConfig(prev => ({ ...prev, [key]: val }))}
                    onGenerate={() => handleNativeGen()}
                    isGenerating={isGeneratingNative}
                />

                {images.length > 0 && (
                    <div className="mb-10">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className=""
                        >
                            {/* Redesigned: Split into TWO separate cards for better readability */}
                            <div className="flex flex-col xl:flex-row gap-6 max-w-[1600px] mx-auto">

                                {/* SETTINGS CARD - Left Side */}
                                <div className="glass-panel p-6 flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                                            <Layers className="w-5 h-5 text-indigo-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">{t('globalConfig')}</h3>
                                            <p className="text-xs text-slate-400">Apply settings to all images</p>
                                        </div>
                                    </div>

                                    {/* Format, Aspect, Resolution */}
                                    <div className="grid grid-cols-3 gap-3 mb-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Format</label>
                                            <select value={bulkFormat} onChange={(e) => setBulkFormat(e.target.value as OutputFormat)} className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all">
                                                <option value={OutputFormat.JPG}>JPG</option>
                                                <option value={OutputFormat.PNG}>PNG</option>
                                                <option value={OutputFormat.WEBP}>WEBP</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Aspect</label>
                                            <select value={bulkAspect} onChange={(e) => setBulkAspect(e.target.value as AspectRatio)} className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all">
                                                <option value={AspectRatio.SQUARE}>1:1 Square</option>
                                                <option value={AspectRatio.LANDSCAPE}>16:9 Wide</option>
                                                <option value={AspectRatio.PORTRAIT}>9:16 Tall</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Quality</label>
                                            <select value={bulkRes} onChange={(e) => setBulkRes(e.target.value as AiResolution)} className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all">
                                                <option value={AiResolution.RES_1K}>1K Quality</option>
                                                <option value={AiResolution.RES_2K}>2K Quality</option>
                                                <option value={AiResolution.RES_4K}>4K Quality</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Global Prompt */}
                                    <div className="mb-5">
                                        <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide flex items-center gap-2">
                                            <PenTool className="w-3.5 h-3.5" />
                                            Creative Prompt (Optional)
                                        </label>
                                        <div className="relative">
                                            {isPromptFocused ? (
                                                <textarea
                                                    autoFocus
                                                    value={globalPrompt}
                                                    onChange={(e) => setGlobalPrompt(e.target.value)}
                                                    onBlur={() => setIsPromptFocused(false)}
                                                    placeholder={t('creativePrompt')}
                                                    className="w-full h-32 bg-slate-900/80 border border-purple-500 text-slate-200 text-sm rounded-lg px-4 py-3 outline-none resize-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                                                />
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={globalPrompt}
                                                    onFocus={() => setIsPromptFocused(true)}
                                                    readOnly
                                                    placeholder={t('creativePrompt')}
                                                    className="w-full bg-slate-900/80 border border-slate-700 text-slate-300 text-sm rounded-lg px-4 py-3 outline-none focus:border-purple-500 cursor-text"
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* Apply Button */}
                                    <button
                                        onClick={applyBulkSettings}
                                        className={`w - full py - 3 rounded - lg font - bold text - sm uppercase tracking - wide transition - all flex items - center justify - center gap - 2 ${isApplied
                                            ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                                            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                                            } `}
                                    >
                                        {isApplied ? <CopyCheck className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
                                        {isApplied ? t('settingsSynced') : t('applyAll')}
                                    </button>
                                </div>

                                {/* QUEUE & ACTIONS CARD - Right Side */}
                                <div className="glass-panel p-6 xl:w-[500px]">
                                    {/* Queue Header */}
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                                <BrainCircuit className="w-5 h-5 text-emerald-400" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">{t('queue')}</h3>
                                                <p className="text-xs text-slate-400 font-mono">{originalCount} Originals • {variantCount} Variants</p>
                                            </div>
                                        </div>
                                        <button onClick={clearQueue} className="p-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 rounded-lg border border-red-900/50 transition-all" title={t('clearQueue')}>
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {/* Action Buttons Grid */}
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        <button onClick={openCompositeModal} className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white px-4 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-pink-900/20">
                                            <PlusSquare className="w-4 h-4" /> {t('composite')}
                                        </button>

                                        <button onClick={openOCRModal} disabled={isExtractingText} className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all">
                                            {isExtractingText ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} {t('extractText')}
                                        </button>
                                    </div>

                                    {/* Naming Pattern */}
                                    <div className="mb-4">
                                        <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">File Naming</label>
                                        <select value={namingPattern} onChange={(e) => setNamingPattern(e.target.value as NamingPattern)} className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer transition-all">
                                            <option value={NamingPattern.ORIGINAL}>{t('originalName')}</option>
                                            <option value={NamingPattern.RANDOM_ID}>{t('randomId')}</option>
                                            <option value={NamingPattern.SEQUENTIAL_PREFIX}>{t('seqPrefix')}</option>
                                        </select>
                                    </div>

                                    {/* Primary Actions */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <button onClick={selectAll} disabled={images.length === 0} className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 uppercase tracking-wide shadow-lg transition-all">
                                            <CopyCheck className="w-5 h-5" /> Select All
                                        </button>

                                        <button onClick={deselectAll} disabled={selectedIds.length === 0} className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-200 px-5 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 uppercase tracking-wide shadow-lg transition-all">
                                            <X className="w-5 h-5" /> Deselect All
                                        </button>
                                        <button onClick={processAll} disabled={globalProcessing} className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 uppercase tracking-wide shadow-lg shadow-emerald-900/20 transition-all">
                                            {globalProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                                            {t('startQueue')}
                                        </button>

                                        <button onClick={() => handleSmartDownload('ALL')} className="bg-white hover:bg-slate-200 text-slate-950 px-5 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all">
                                            <Download className="w-5 h-5" /> Download All
                                        </button>

                                        <button onClick={() => handleSmartDownload('UPLOADED')} className="col-span-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all">
                                            <Download className="w-4 h-4" /> Uploads Only
                                        </button>

                                        <button onClick={() => handleSmartDownload('GENERATED')} className="col-span-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all">
                                            <Download className="w-4 h-4" /> Generated Only
                                        </button>

                                        {selectedIds.length > 0 && (
                                            <>
                                                <button onClick={() => handleSmartDownload('SELECTED', selectedIds)} className="col-span-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2">
                                                    <Download className="w-5 h-5" /> Download Selected ({selectedIds.length})
                                                </button>
                                                <button onClick={deleteSelected} className="col-span-2 bg-red-600 hover:bg-red-500 text-white px-5 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2">
                                                    <Trash2 className="w-5 h-5" /> Delete Selected ({selectedIds.length})
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                <AnimatePresence>
                    {ocrText && (
                        <motion.div initial={{ height: 0, opacity: 0, marginBottom: 0 }} animate={{ height: 'auto', opacity: 1, marginBottom: 32 }} exit={{ height: 0, opacity: 0, marginBottom: 0 }} className="overflow-hidden">
                            <div className="bg-[#0f172a] border border-slate-700 rounded-2xl p-0 shadow-2xl overflow-hidden">
                                <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
                                    <h3 className="text-slate-200 font-bold text-sm uppercase tracking-widest flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-400" /> {t('ocrReport')}</h3>
                                    <div className="flex gap-2">
                                        <button onClick={copyOcrToClipboard} className={`flex items - center gap - 2 px - 3 py - 1.5 rounded - lg text - xs font - bold transition - all ${isTextCopied ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'} `}>
                                            {isTextCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {isTextCopied ? t('copied') : t('copyText')}
                                        </button>
                                        <button onClick={() => setOcrText(null)} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="p-6 bg-[#020617] relative">
                                    <pre className="text-slate-300 font-mono text-sm leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[400px] custom-scrollbar">
                                        {ocrText}
                                    </pre>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="grid grid-cols-1 gap-6">
                    <AnimatePresence>
                        {images.map((img, index) => (
                            <ImageCard
                                key={img.id}
                                item={img}
                                onUpdateConfig={updateConfig}
                                onProcess={processSingleImage}
                                onRemove={removeImage}
                                onEdit={setEditingId}
                                onMultiVariant={handleMultiVariant}
                                isSelected={selectedIds.includes(img.id)}
                                onToggleSelection={() => handleSelectionToggle(img.id)}
                                onQuickRemoveText={() => handleQuickRemoveText(img.id)}
                                displayIndex={index + 1}
                            />
                        ))}
                    </AnimatePresence>
                </div>

            </main>
        </div>
    );
};

export default App;
