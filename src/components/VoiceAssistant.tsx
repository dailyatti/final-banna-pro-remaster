import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, Sparkles, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { ImageItem } from '../types';

interface VoiceAssistantProps {
    apiKey: string;
    onCommand: (command: any) => void;
    onAudit: () => void;
    onApplyAll: () => void;
    onCompositeUpdate?: (updates: any) => void;
    currentLanguage: string;
    images?: ImageItem[];
    batchCompleteTrigger?: number;
    nativePrompt?: string;
    isNativeGenerating?: boolean;
    modalsState?: {
        composite: boolean;
        ocr: boolean;
        guide: boolean;
        langMenu?: boolean;
    };
}

/* ====================== AUDIO UTILS ====================== */

const decodeBase64 = (base64: string): Uint8Array => {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

const pcmToBlob = (data: Float32Array, sampleRate: number) => {
    const length = data.length;
    const int16 = new Int16Array(length);
    for (let i = 0; i < length; i++) {
        const s = Math.max(-1, Math.min(1, data[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
    return { data: base64, mimeType: `audio/pcm;rate=${sampleRate}` };
};

const decodeAudioBuffer = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number = 24000
): Promise<AudioBuffer> => {
    const int16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    const buffer = ctx.createBuffer(1, int16.length, sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) {
        channelData[i] = int16[i] / 32768;
    }
    return buffer;
};

/* ====================== COMPONENT ====================== */

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
    apiKey,
    onCommand,
    onAudit,
    onApplyAll,
    onCompositeUpdate,
    currentLanguage,
    images = [],
    batchCompleteTrigger = 0,
    nativePrompt = '',
    modalsState = { composite: false, ocr: false, guide: false, langMenu: false },
}) => {
    const { t } = useTranslation();

    const [isActive, setIsActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [volume, setVolume] = useState(0);

    // Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const inputContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextPlayTimeRef = useRef(0);
    const sessionRef = useRef<Promise<any> | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    /* ================== CLEANUP ================== */

    const cleanup = useCallback(() => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current?.state !== 'closed') {
            audioContextRef.current?.close();
        }
        if (inputContextRef.current?.state !== 'closed') {
            inputContextRef.current?.close();
        }
        activeSourcesRef.current.forEach(s => {
            try { s.stop(); } catch { }
        });
        activeSourcesRef.current.clear();
        nextPlayTimeRef.current = 0;
        sessionRef.current = null;

        setIsActive(false);
        setIsConnecting(false);
        setVolume(0);
    }, []);

    /* ================== SYSTEM STATE ================== */

    const getStateReport = () => `
[SYSTEM STATE – ${new Date().toISOString()}]
Language: ${currentLanguage}
Native Prompt: "${nativePrompt || 'empty'}"
Modals → Composite: ${modalsState.composite} | OCR: ${modalsState.ocr} | Guide: ${modalsState.guide} | LangMenu: ${modalsState.langMenu}
Images in queue: ${images.length}
Generating: ${isNativeGenerating ? 'YES' : 'NO'}
  `.trim();

    const getSystemInstruction = () => {
        const hu = currentLanguage === 'hu';
        const ctx = modalsState.composite
            ? (hu
                ? "JELENLEG A COMPOSITE (KÉPÖSSZEOLVASZTÓ) ABLAKBAN VAGY. MINDEN KÉP-PARANCS IDE ÉRTENDŐ!"
                : "YOU ARE INSIDE THE COMPOSITE (IMAGE MIXER) MODAL. ALL IMAGE COMMANDS APPLY HERE!")
            : "";

        return hu
            ? `SZEREPLŐ: BananaAI Rendszergazda (PhD szintű szlengtudás).
${ctx}

SZLENG → GENERÁL: told neki, nyomd, mehet, dobáld, pörgesd, csináld, start go hajrá
SZLENG → MÓDOSÍT: variáld, tekerd, piszkáld, reszelj, cseréld, finomítsd
SZLENG → TÖRÖL: kuka, dobd ki, radírozd, tűntesd el, söprés
SZLENG → KOMPOZIT: mosd össze, turmix, mixeld, montázs, rakd egybe
SZLENG → BEZÁR: csukd be, zárj be, tűnj el, lépj le, viszlát, vége
SZLENG → CSEND: kuss, csend, fogd be, állj, stop, nyugi

PARANCSOK:
- Nyisson/zárjon ablakot → manage_ui_state
- Generálás → trigger_native_generation (azonnal, kérdés nélkül)
- Nyelvváltás → manage_ui_state + CHANGE_LANG + 'hu'|'en'|'de'
- Dokumentáció felolvasása → read_documentation
- Megszakítás → playback_control STOP

MINDIG azonnal végrehajtod a parancsot. Soha nem kérdezel vissza.`
            : `ROLE: BananaAI System Admin (PhD-level slang mastery).
${ctx}

SLANG → GENERATE: send it, hit it, whip it, cook it, go, run it, make it happen
SLANG → MODIFY: tweak, remix, adjust, spin it, fiddle
SLANG → DELETE: trash, nuke, bin, kill it, clear
SLANG → COMPOSITE: mash up, blend, fuse, mix, collage
SLANG → CLOSE: close it, shut it, bye, get out, disappear
SLANG → SILENCE: stop, hush, quiet, zip it

COMMANDS:
→ Open/close windows → manage_ui_state
→ Generate image → trigger_native_generation (immediately, no confirmation)
→ Change language → manage_ui_state + CHANGE_LANG + 'hu'|'en'|'de'
→ Read docs → read_documentation
→ Interrupt → playback_control STOP

Execute IMMEDIATELY. Never ask for confirmation.`;
    };

    /* ================== VISUAL CONTEXT ================== */

    const sendVisualContext = async (session: any) => {
        if (!images.length) return;
        const batch = images.slice(0, 4);
        for (const img of batch) {
            try {
                const image = new Image();
                image.crossOrigin = 'anonymous';
                image.src = img.previewUrl;
                await new Promise(res => { image.onload = res; });

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;
                const MAX = 1024;
                let { width, height } = image;
                if (width > height && width > MAX) { height = height * (MAX / width); width = MAX; }
                if (height > width && height > MAX) { width = width * (MAX / height); height = MAX; }
                canvas.width = width; canvas.height = height;
                ctx.drawImage(image, 0, 0, width, height);
                const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

                session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: b64 } });
            } catch (e) {
                console.warn('Visual context send failed for one image', e);
            }
        }
    };

    /* ================== VOLUME VISUALIZER ================== */

    const startVolumeVisualizer = () => {
        if (!inputContextRef.current || !analyzerRef.current) return;
        const update = () => {
            if (!analyzerRef.current) return;
            const data = new Uint8Array(analyzerRef.current!.frequencyBinCount);
            analyzerRef.current!.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            setVolume(Math.min(100, avg));
            animationFrameRef.current = requestAnimationFrame(update);
        };
        update();
    };

    /* ================== START SESSION ================== */

    const startSession = async () => {
        if (isActive || isConnecting) return;
        if (!apiKey) {
            alert('Voice Assistant: Missing API key');
            return;
        }

        setIsConnecting(true);

        try {
            // Output context – 24kHz for Gemini Live
            const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContextRef.current = outputCtx;
            gainNodeRef.current = outputCtx.createGain();
            gainNodeRef.current.connect(outputCtx.destination);

            // Input context – let browser decide best rate
            const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            inputContextRef.current = inputCtx;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const analyzer = inputCtx.createAnalyser();
            analyzer.fftSize = 512;
            analyzerRef.current = analyzer;

            const micSource = inputCtx.createMediaStreamSource(stream);
            sourceNodeRef.current = micSource;
            micSource.connect(analyzer);

            startVolumeVisualizer();

            const ai = new GoogleGenAI({ apiKey });
            const tools = [/* ... ugyanazok a tool-ok, mint eredetileg – lásd lent */];

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.0-flash-exp', // vagy a legfrissebb live modell
                config: {
                    tools,
                    systemInstruction: getSystemInstruction(),
                    responseModalities: [Modality.AUDIO],
                },
                callbacks: {
                    onopen: async () => {
                        setIsActive(true);
                        setIsConnecting(false);

                        const session = await sessionPromise;

                        // Init state
                        session.sendToolResponse({
                            functionResponses: [{
                                name: 'system_init',
                                id: 'init-' + Date.now(),
                                response: { result: getStateReport() }
                            }]
                        });

                        // Audio pipeline
                        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                        processorRef.current = processor;

                        processor.onaudioprocess = (e) => {
                            const input = e.inputBuffer.getChannelData(0);
                            const blob = pcmToBlob(input, inputCtx.sampleRate);
                            session.sendRealtimeInput({ media: blob });
                        };

                        micSource.connect(processor);
                        processor.connect(inputCtx.destination);
                    },

                    onmessage: async (msg: LiveServerMessage) => handleServerMessage(msg, sessionPromise),

                    onclose: cleanup,
                    onerror: cleanup,
                },
            });

            sessionRef.current = sessionPromise;
        } catch (err: any) {
            console.error('Voice Assistant failed:', err);
            alert('Voice Assistant hiba: ' + err.message);
            cleanup();
        }
    };

    /* ================== TOOL HANDLER ================== */

    const handleServerMessage = async (msg: LiveServerMessage, sessionPromise: Promise<any>) => {
        if (msg.toolCall?.functionCalls?.length) {
            setIsExecuting(true);
            const responses: any[] = [];

            for (const call of msg.toolCall.functionCalls) {
                const args = call.args || {};
                let result: any = { ok: true };

                switch (call.name) {
                    case 'get_system_state':
                        result = { message: getStateReport() };
                        break;

                    case 'scroll_viewport':
                        onCommand({ scrollAction: args.direction });
                        break;

                    case 'update_native_input':
                        onCommand({ updateNative: true, ...args });
                        break;

                    case 'trigger_native_generation':
                        onCommand({
                            triggerNative: true,
                            prompt: args.prompt, aspectRatio: args.aspectRatio,
                            resolution: args.resolution, format: args.format
                        });
                        break;

                    case 'manage_ui_state':
                        onCommand({ uiAction: args.action, value: args.value });
                        break;

                    case 'manage_composite_settings':
                        onCompositeUpdate?.(args);
                        break;

                    case 'manage_composite_selection':
                        onCommand({ compositeSelectionAction: args.action, targetIndex: args.targetIndex });
                        break;

                    case 'perform_item_action':
                        onCommand({ itemAction: args.action, targetIndex: args.targetIndex });
                        break;

                    case 'apply_settings_globally':
                        onApplyAll();
                        break;

                    case 'analyze_images':
                        onAudit();
                        break;

                    case 'request_visual_context':
                        sessionPromise.then(s => sendVisualContext(s));
                        continue;

                    case 'read_documentation':
                        const docs = t('fullGuideText'); // feltételezzük, hogy van ilyen i18n kulcs
                        onCommand({ uiAction: 'OPEN_DOCS' });
                        result = {
                            message: `READ THIS ALOUD NATURALLY:\n\n${docs}`
                        };
                        break;

                    case 'playback_control':
                        if (args.action === 'STOP') {
                            activeSourcesRef.current.forEach(s => s.stop());
                            activeSourcesRef.current.clear();
                            nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
                        } else if (args.action === 'PAUSE') {
                            audioContextRef.current?.suspend();
                        } else if (args.action === 'RESUME') {
                            audioContextRef.current?.resume();
                        }
                        break;

                    case 'close_assistant':
                        cleanup();
                        return;

                    // további tool-ok ugyanígy...
                }

                responses.push({ id: call.id, name: call.name, response: { result } });
            }

            if (responses.length) {
                (await sessionPromise).sendToolResponse({ functionResponses: responses });
            }
            setTimeout(() => setIsExecuting(false), 400);
        }

        // Audio playback
        const audioB64 = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audioB64 && audioContextRef.current) {
            try {
                const buffer = await decodeAudioBuffer(decodeBase64(audioB64), audioContextRef.current);
                const source = audioContextRef.current.createBufferSource();
                source.buffer = buffer;
                source.connect(gainNodeRef.current!);
                const startAt = Math.max(nextPlayTimeRef.current, audioContextRef.current.currentTime);
                source.start(startAt);
                nextPlayTimeRef.current = startAt + buffer.duration;
                activeSourcesRef.current.add(source);
                source.onended = () => activeSourcesRef.current.delete(source);
            } catch (e) {
                console.warn('Audio playback error', e);
            }
        }
    };

    /* ================== BATCH COMPLETE ANNOUNCE ================== */

    useEffect(() => {
        if (batchCompleteTrigger > 0 && sessionRef.current) {
            sessionRef.current.then(s => {
                s.sendRealtimeInput({
                    text: currentLanguage === 'hu'
                        ? '[SYSTEM: Kötegelt generálás kész! Jelentsd be hangosan a felhasználónak.]'
                        : '[SYSTEM: Batch generation complete! Announce it to the user.]'
                });
            });
        }
    }, [batchCompleteTrigger, currentLanguage]);

    /* ================== RENDER ================== */

    return createPortal(
        <motion.div
            drag
            dragMomentum={false}
            whileDrag={{ scale: 1.15 }}
            className="fixed bottom-8 right-8 z-[9999] select-none"
        >
            <AnimatePresence>
                {isActive && (
                    <div className="flex flex-col items-end gap-3 mb-4">
                        {isExecuting && (
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 30 }}
                                className="bg-purple-900/90 backdrop-blur-lg border border-purple-500/40 text-purple-100 px-4 py-2 rounded-full rounded-full shadow-2xl flex items-center gap-2 text-sm"
                            >
                                <Sparkles className="w-4 h-4 animate-spin" />
                                Végrehajtás...
                            </motion.div>
                        )}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-emerald-900/90 backdrop-blur-lg border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-sm"
                        >
                            <Volume2 className="w-4 h-4 animate-pulse" />
                            Kapcsolódva ({Math.round(volume)}%)
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <button
                onClick={() => (isActive ? cleanup() : startSession())}
                className={`
          relative w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300
          ${isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:scale-110'}
          ${isConnecting ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}
        `}
                disabled={isConnecting}
            >
                {/* Pulse ring */}
                {isActive && (
                    <div
                        className="absolute inset-0 rounded-full border-4 border-white/30 animate-ping"
                        style={{ animationDuration: '2s' }}
                    />
                )}
                {isConnecting ? (
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                ) : isActive ? (
                    <Mic className="w-10 h-10 text-white" />
                ) : (
                    <MicOff className="w-10 h-10 text-white/80" />
                )}
            </button>
        </motion.div>,
        document.body
    );
};