import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, Sparkles, X, Activity, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
// Feltételezzük, hogy ez a típus létezik a projektedben
import { ImageItem } from '../types'; 

// --- Interfaces & Types (Strict Typing) ---

export interface ModalsState {
    composite: boolean;
    ocr: boolean;
    guide: boolean;
    langMenu?: boolean;
}

export interface CompositeUpdates {
    prompt?: string;
    caption?: string;
    showCaption?: boolean;
    aspectRatio?: string;
    resolution?: string;
    format?: string;
}

// Unified Command Interface
export interface AssistantCommand {
    type?: 'UI_ACTION' | 'SCROLL' | 'UPDATE_DASHBOARD' | 'NATIVE_INPUT' | 'TRIGGER_GEN' | 'ITEM_ACTION' | 'QUEUE_ACTION';
    uiAction?: 'OPEN_COMPOSITE' | 'CLOSE_COMPOSITE' | 'OPEN_OCR' | 'OPEN_DOCS' | 'CHANGE_LANG' | 'CLOSE_ALL' | string;
    value?: string;
    scrollAction?: 'UP' | 'DOWN' | 'TOP' | 'BOTTOM';
    updateNative?: boolean;
    prompt?: string;
    aspectRatio?: string;
    resolution?: string;
    format?: string;
    triggerNative?: boolean;
    itemAction?: string;
    targetIndex?: string;
    queueAction?: string;
    compositeSelectionAction?: string;
    startQueue?: boolean;
}

interface VoiceAssistantProps {
    apiKey: string;
    currentLanguage: string;
    images?: ImageItem[];
    modalsState?: ModalsState;
    batchCompleteTrigger?: number;
    nativePrompt?: string;
    isNativeGenerating?: boolean;
    // Callbacks
    onCommand: (command: AssistantCommand) => void;
    onAudit: () => void;
    onApplyAll: () => void;
    onCompositeUpdate?: (updates: CompositeUpdates) => void;
}

// --- Audio Processing Engine (DSP Helpers) ---

/**
 * Decodes raw PCM 16-bit LE data from Gemini into an AudioBuffer for playback.
 */
async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number = 24000,
    numChannels: number = 1
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            // Normalize Int16 to Float32 [-1.0, 1.0]
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

/**
 * Encodes Float32 mic audio to Base64 encoded PCM Int16 for Gemini.
 */
function createPcmBlob(data: Float32Array, sampleRate: number): { data: string; mimeType: string } {
    const l = data.length;
    const int16 = new Int16Array(l);

    for (let i = 0; i < l; i++) {
        // Hard Limiter: Clamp values between -1.0 and 1.0
        const s = Math.max(-1, Math.min(1, data[i]));
        // Convert to PCM Int16
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // High-performance binary string construction
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    
    // Chunk processing
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return {
        data: btoa(binary),
        mimeType: `audio/pcm;rate=${sampleRate}`,
    };
}

// --- Main Component ---

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
    apiKey,
    onCommand,
    onAudit,
    onApplyAll,
    onCompositeUpdate,
    currentLanguage,
    images = [],
    modalsState = { composite: false, ocr: false, guide: false, langMenu: false }
}) => {
    const { t } = useTranslation();

    // --- Local State ---
    const [isActive, setIsActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [volume, setVolume] = useState(0);

    // --- Refs ---
    const audioContextRef = useRef<AudioContext | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const sessionRef = useRef<Promise<any> | null>(null);

    // Audio Scheduling Refs
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const rafRef = useRef<number | null>(null);

    // --- System Prompt ---
    const getSystemInstruction = useMemo(() => {
        const isHu = currentLanguage === 'hu';

        const activeModals = [];
        if (modalsState.composite) activeModals.push("COMPOSITE_EDITOR");
        if (modalsState.ocr) activeModals.push("OCR_PANEL");
        if (modalsState.guide) activeModals.push("USER_GUIDE");

        const contextStr = activeModals.length > 0
            ? `[ACTIVE UI CONTEXT: ${activeModals.join(', ')}]`
            : "[ACTIVE UI CONTEXT: MAIN_DASHBOARD]";

        const basePrompt = isHu ? `
      SZEREPLŐ: BananaAI Rendszergazda (PhD szintű, profi, lényegre törő).
      CÉL: A felhasználói felület (UI) teljeskörű vezérlése hanggal.
      ${contextStr}

      PARANCS PROTOKOLL:
      1. ABLAKOK KEZELÉSE: Ha a felhasználó azt mondja "nyisd meg", "zárd be", "lépjünk be", "lépjünk ki", AZONNAL hívd a 'manage_ui_state' eszközt.
      2. GENERÁLÁS: Ha a felhasználó generálni akar ("mehet", "csináld", "alkosd meg"), hívd a 'trigger_native_generation' eszközt.
      3. SCROLL/GÖRGETÉS: "lejjebb", "feljebb" -> 'scroll_viewport'.

      FONTOS SZABÁLYOK:
      - Ha a felhasználó bezárást kér, hívd a 'close_assistant' eszközt.
      - Válaszaid legyenek rövidek.
    ` : `
      ROLE: BananaAI System Admin (Expert Level, concise).
      GOAL: Full voice control of the UI.
      ${contextStr}

      COMMAND PROTOCOL:
      1. WINDOW MANAGEMENT: "open", "close", "enter", "exit" -> call 'manage_ui_state'.
      2. GENERATION: "go", "make it", "generate" -> call 'trigger_native_generation'.
      3. SCROLLING: "scroll down", "go up" -> call 'scroll_viewport'.

      RULES:
      - If user says "stop", "close", call 'close_assistant'.
      - Keep responses brief.
    `;

        return basePrompt;
    }, [currentLanguage, modalsState]);

    // --- Session Lifecycle ---

    const stopSession = useCallback(() => {
        console.log("Stopping Voice Assistant Session...");

        // 1. Close Gemini Session
        sessionRef.current = null;

        // 2. Cleanup Microphone Input
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (inputAudioContextRef.current) {
            inputAudioContextRef.current.close().catch(() => {});
            inputAudioContextRef.current = null;
        }

        // 3. Cleanup Speaker Output
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }

        // 4. Stop Active Audio
        sourcesRef.current.forEach(source => {
            try { source.stop(); } catch (e) { /* ignore */ }
        });
        sourcesRef.current.clear();

        // 5. Cleanup UI Loop
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        nextStartTimeRef.current = 0;
        setIsActive(false);
        setIsConnecting(false);
        setIsExecuting(false);
        setVolume(0);
        // We do NOT reset hasError here intentionally, so the user sees the error state if it just crashed
    }, []);

    const startSession = async () => {
        if (isActive || isConnecting) return;
        setHasError(false);

        if (!apiKey) {
            console.error("VoiceAssistant: No API Key provided.");
            setHasError(true);
            return;
        }

        setIsConnecting(true);

        try {
            // 1. Get User Media - ROBUST METHOD
            // Try ideal settings first, fallback to basic if it fails (OverconstrainedError)
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        channelCount: 1,
                        // Removed strict sampleRate to prevent hardware errors
                    }
                });
            } catch (err) {
                console.warn("High-quality audio failed, falling back to basic...", err);
                // Fallback: Just give me whatever audio you have
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            
            streamRef.current = stream;

            // 2. Initialize Audio Contexts
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            
            // Input Context
            const inputCtx = new AudioContextClass();
            inputAudioContextRef.current = inputCtx;
            // CRITICAL: Resume immediately after user gesture
            if (inputCtx.state === 'suspended') {
                await inputCtx.resume(); 
            }

            // Output Context (24kHz is standard for Gemini Flash Audio)
            const outputCtx = new AudioContextClass({ sampleRate: 24000 });
            audioContextRef.current = outputCtx;
            // CRITICAL: Resume immediately
            if (outputCtx.state === 'suspended') {
                await outputCtx.resume();
            }

            // 3. Initialize Visualizer
            const analyzer = inputCtx.createAnalyser();
            analyzer.fftSize = 256;
            const visSource = inputCtx.createMediaStreamSource(stream);
            visSource.connect(analyzer);

            const updateVol = () => {
                if (!inputAudioContextRef.current) return;
                const data = new Uint8Array(analyzer.frequencyBinCount);
                analyzer.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b) / data.length;
                setVolume(Math.min(100, (avg / 128) * 100));
                rafRef.current = requestAnimationFrame(updateVol);
            };
            updateVol();

            // 4. Initialize Gemini Connection
            const ai = new GoogleGenAI({ apiKey });
            
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    tools: getToolsDefinition(),
                    systemInstruction: getSystemInstruction,
                }
            });

            sessionRef.current = sessionPromise;
            const session = await sessionPromise;

            // --- Handlers ---

            session.on('open', () => {
                console.log("Gemini Connection Opened");
                setIsActive(true);
                setIsConnecting(false);

                // Send Initial Context
                session.sendRealtimeInput([{
                    text: `[SYSTEM_INIT: UI_STATE=${JSON.stringify(modalsState)}]`
                }]);

                // 5. Start Audio Pipeline (Mic -> Gemini)
                const source = inputCtx.createMediaStreamSource(stream);
                sourceRef.current = source;

                // Use ScriptProcessor for raw PCM access (bufferSize: 4096)
                // This is deprecated but the most reliable way to get raw PCM across all browsers without Worklets
                const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;

                processor.onaudioprocess = (e) => {
                    if (!sessionRef.current) return;

                    const inputData = e.inputBuffer.getChannelData(0);
                    // Encode and send
                    const pcmData = createPcmBlob(inputData, inputCtx.sampleRate);
                    session.sendRealtimeInput({ 
                        mimeType: pcmData.mimeType, 
                        data: pcmData.data 
                    });
                };

                source.connect(processor);
                // Connect processor to destination to keep it alive (muted via logic, not gain)
                processor.connect(inputCtx.destination);
            });

            session.on('message', async (message: LiveServerMessage) => {
                // Handle Tool Calls
                if (message.toolCall) {
                    handleToolCall(message.toolCall);
                }

                // Handle Audio Response
                const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (base64Audio && audioContextRef.current) {
                    try {
                        const ctx = audioContextRef.current;
                        const byteCharacters = atob(base64Audio);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);

                        const buffer = await decodeAudioData(byteArray, ctx);

                        const now = ctx.currentTime;
                        if (nextStartTimeRef.current < now) {
                            nextStartTimeRef.current = now;
                        }

                        const source = ctx.createBufferSource();
                        source.buffer = buffer;
                        source.connect(ctx.destination);
                        
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += buffer.duration;

                        sourcesRef.current.add(source);
                        source.onended = () => sourcesRef.current.delete(source);

                    } catch (err) {
                        console.error("Audio Decode Error:", err);
                    }
                }
            });

            session.on('close', () => {
                console.log("Session Closed by Server");
                stopSession();
            });

            session.on('error', (err: any) => {
                console.error("Session Error:", err);
                setHasError(true);
                stopSession();
            });

        } catch (e) {
            console.error("Failed to start session:", e);
            setHasError(true);
            setIsConnecting(false);
            stopSession();
        }
    };

    // --- Tools Definition ---

    const getToolsDefinition = () => [{
        functionDeclarations: [
            {
                name: 'manage_ui_state',
                description: 'Opens/closes UI modals.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        action: {
                            type: Type.STRING,
                            enum: ['OPEN_COMPOSITE', 'CLOSE_COMPOSITE', 'OPEN_OCR', 'OPEN_DOCS', 'CHANGE_LANG', 'CLOSE_ALL']
                        },
                        value: { type: Type.STRING }
                    },
                    required: ['action']
                }
            },
            {
                name: 'trigger_native_generation',
                description: 'Generates images.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        prompt: { type: Type.STRING },
                        aspectRatio: { type: Type.STRING }
                    }
                }
            },
            {
                name: 'scroll_viewport',
                description: 'Scrolls screen.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        direction: { type: Type.STRING, enum: ['UP', 'DOWN', 'TOP', 'BOTTOM'] }
                    },
                    required: ['direction']
                }
            },
            {
                name: 'close_assistant',
                description: 'Stops the session.',
                parameters: { type: Type.OBJECT, properties: {} }
            }
        ]
    }];

    const handleToolCall = async (toolCall: any) => {
        setIsExecuting(true);
        const functionResponses = [];

        for (const fc of toolCall.functionCalls) {
            const { name, args, id } = fc;
            let result = { ok: true, message: "Done" };
            console.log(`Tool Call: ${name}`, args);

            try {
                switch (name) {
                    case 'manage_ui_state':
                        onCommand({ uiAction: args.action, value: args.value });
                        break;
                    case 'trigger_native_generation':
                        onCommand({ triggerNative: true, prompt: args.prompt, aspectRatio: args.aspectRatio });
                        break;
                    case 'scroll_viewport':
                        onCommand({ scrollAction: args.direction });
                        break;
                    case 'close_assistant':
                        stopSession();
                        return; // Exit immediately
                    default:
                        result = { ok: false, message: "Unknown tool" };
                }
            } catch (e) {
                result = { ok: false, message: "Error" };
            }

            functionResponses.push({
                id,
                name,
                response: { result }
            });
        }

        if (sessionRef.current) {
            const s = await sessionRef.current;
            // Catch error if session closed during execution
            try {
                s.sendToolResponse({ functionResponses });
            } catch(e) {
                console.warn("Could not send tool response, session closed.");
            }
        }

        setTimeout(() => setIsExecuting(false), 500);
    };

    // --- React Effects ---

    useEffect(() => {
        return () => stopSession();
    }, [stopSession]);

    // Sync UI State to AI
    useEffect(() => {
        if (isActive && sessionRef.current) {
            sessionRef.current.then((s: any) => {
                s.sendRealtimeInput([{
                    text: `[SYSTEM: UI_STATE=${JSON.stringify(modalsState)}]`
                }]);
            }).catch(() => {});
        }
    }, [modalsState, isActive]);

    // --- Render ---

    if (typeof window === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                drag
                dragMomentum={false}
                whileDrag={{ scale: 1.05 }}
                className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 cursor-move touch-none font-sans select-none"
            >
                {/* Status Bubble */}
                <AnimatePresence>
                    {(isActive || hasError) && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.9 }}
                            className="flex flex-col items-end gap-2"
                        >
                            {hasError && (
                                <div className="bg-red-600/90 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 border border-red-400/30">
                                    <AlertCircle className="w-3 h-3" />
                                    Connection Failed
                                </div>
                            )}

                            {isActive && isExecuting && (
                                <div className="bg-purple-600/90 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 border border-purple-400/30">
                                    <Sparkles className="w-3 h-3 animate-spin" />
                                    Processing...
                                </div>
                            )}

                            {isActive && (
                                <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 text-emerald-400 text-xs font-mono px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3">
                                    <div className="flex gap-0.5 items-end h-3">
                                        {[1, 2, 3, 4].map(i => (
                                            <motion.div
                                                key={i}
                                                className="w-1 bg-emerald-400 rounded-t-full"
                                                animate={{ height: Math.max(3, Math.min(14, volume * (0.4 * i))) }}
                                                transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                                            />
                                        ))}
                                    </div>
                                    <span className="font-semibold tracking-wide">LIVE</span>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Button */}
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        // Reset error state on new click
                        if (hasError) setHasError(false);
                        isActive ? stopSession() : startSession();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="cursor-pointer"
                >
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`
                            relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300
                            ${hasError
                                ? 'bg-red-600 ring-4 ring-red-500/20'
                                : isActive
                                    ? 'bg-red-500 hover:bg-red-600 shadow-red-500/40 ring-4 ring-red-500/20'
                                    : isConnecting
                                        ? 'bg-slate-700 ring-4 ring-slate-500/20'
                                        : 'bg-gradient-to-br from-indigo-600 to-violet-600 hover:brightness-110 shadow-indigo-500/40 ring-4 ring-indigo-500/20'
                            }
                        `}
                    >
                        {isActive && !hasError && (
                            <span className="absolute inset-0 rounded-2xl border-2 border-white/40 animate-ping opacity-20"></span>
                        )}

                        {isConnecting ? (
                            <Loader2 className="w-7 h-7 text-white animate-spin" />
                        ) : hasError ? (
                            <AlertCircle className="w-7 h-7 text-white drop-shadow-md" />
                        ) : isActive ? (
                            <Mic className="w-7 h-7 text-white drop-shadow-md" />
                        ) : (
                            <MicOff className="w-7 h-7 text-white/70" />
                        )}

                        {(isActive || hasError) && (
                            <div
                                onClick={(e) => { e.stopPropagation(); stopSession(); setHasError(false); }}
                                className="absolute -top-2 -right-2 bg-slate-800 text-slate-300 rounded-full p-1.5 hover:bg-red-500 hover:text-white transition-colors border border-white/10 shadow-lg"
                            >
                                <X className="w-3 h-3" />
                            </div>
                        )}
                    </motion.div>
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

export default VoiceAssistant;