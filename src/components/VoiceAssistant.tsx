import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, Sparkles, X, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { ImageItem } from '../types';

// --- Interfaces & Types (Strict Typing for Maintainability) ---

interface ModalsState {
    composite: boolean;
    ocr: boolean;
    guide: boolean;
    langMenu?: boolean;
}

interface VoiceAssistantProps {
    apiKey: string;
    currentLanguage: string;
    images?: ImageItem[];
    modalsState?: ModalsState;
    batchCompleteTrigger?: number;
    nativePrompt?: string;
    isNativeGenerating?: boolean;
    // Callbacks for Parent Communication
    onCommand: (command: AssistantCommand) => void;
    onAudit: () => void;
    onApplyAll: () => void;
    onCompositeUpdate?: (updates: CompositeUpdates) => void;
}

interface CompositeUpdates {
    prompt?: string;
    caption?: string;
    showCaption?: boolean;
    aspectRatio?: string;
    resolution?: string;
    format?: string;
}

// Unified Command Interface - Single Source of Truth for Actions
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

// --- Audio Processing Engine (DSP Helpers) ---

/**
 * Decodes raw PCM 16-bit LE data from Gemini into an AudioBuffer for playback.
 * Optimized for low latency.
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
            // Normalize Int16 to Float32 [-1.0, 1.0] with precise division
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

/**
 * Encodes Float32 mic audio to Base64 encoded PCM Int16 for Gemini.
 * Includes signal clamping/limiting to prevent digital clipping distortion.
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
    // Processing in chunks could optimize this further for massive buffers, 
    // but for realtime chunks (4096 frames), this is sufficiently fast.
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return {
        data: btoa(binary),
        // CRITICAL: Inform API of actual hardware sample rate to prevent pitch shifting
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
    batchCompleteTrigger = 0,
    nativePrompt = '',
    modalsState = { composite: false, ocr: false, guide: false, langMenu: false }
}) => {
    const { t } = useTranslation();

    // --- Local State ---
    const [isActive, setIsActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false); // Indicates tool execution
    const [volume, setVolume] = useState(0);

    // --- Refs (Mutable State & Cleanup) ---
    const audioContextRef = useRef<AudioContext | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const sessionRef = useRef<Promise<any> | null>(null); // Typed as Promise for the Gemini session

    // Audio Scheduling Refs
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const rafRef = useRef<number | null>(null);

    // --- System Prompt Generation (Context Injection) ---

    const getSystemInstruction = useMemo(() => {
        const isHu = currentLanguage === 'hu';

        // Dynamic context: Tell the AI exactly what is open on the screen
        const activeModals = [];
        if (modalsState.composite) activeModals.push("COMPOSITE_EDITOR");
        if (modalsState.ocr) activeModals.push("OCR_PANEL");
        if (modalsState.guide) activeModals.push("USER_GUIDE");

        const contextStr = activeModals.length > 0
            ? `[ACTIVE UI CONTEXT: ${activeModals.join(', ')}]`
            : "[ACTIVE UI CONTEXT: MAIN_DASHBOARD]";

        // The Persona
        const basePrompt = isHu ? `
      SZEREPLŐ: BananaAI Rendszergazda (PhD szintű, profi, lényegre törő).
      CÉL: A felhasználói felület (UI) teljeskörű vezérlése hanggal.
      ${contextStr}

      PARANCS PROTOKOLL:
      1. ABLAKOK KEZELÉSE: Ha a felhasználó azt mondja "nyisd meg", "zárd be", "lépjünk be", "lépjünk ki", AZONNAL hívd a 'manage_ui_state' eszközt. Ne kérdezz vissza.
      2. GENERÁLÁS: Ha a felhasználó generálni akar ("mehet", "csináld", "alkosd meg"), hívd a 'trigger_native_generation' eszközt.
      3. SCROLL/GÖRGETÉS: Ha a felhasználó nem lát valamit ("lejjebb", "feljebb"), használd a 'scroll_viewport' eszközt.

      FONTOS SZABÁLYOK:
      - Ha a felhasználó bezárást kér ("kuss", "zárj be", "viszlát"), hívd a 'close_assistant' eszközt VAGY némítsd el magad.
      - Válaszaid legyenek rövidek. "Rendben.", "Megnyitva.", "Generálom."
    ` : `
      ROLE: BananaAI System Admin (Expert Level, concise).
      GOAL: Full voice control of the UI.
      ${contextStr}

      COMMAND PROTOCOL:
      1. WINDOW MANAGEMENT: If user says "open", "close", "enter", "exit", IMMEDIATELY call 'manage_ui_state'. Do not hesitate.
      2. GENERATION: Triggers like "go", "make it", "generate" -> call 'trigger_native_generation'.
      3. SCROLLING: "scroll down", "go up" -> call 'scroll_viewport'.

      RULES:
      - If user says "shut up", "close", "bye", call 'close_assistant'.
      - Keep responses extremely brief. "Done.", "Opening.", "On it."
    `;

        return basePrompt;
    }, [currentLanguage, modalsState]);

    // --- Session Lifecycle Management ---

    /**
     * Hard Stop: Cleans up ALL audio contexts, streams, and processors.
     * Designed to prevent memory leaks and feedback loops.
     */
    const stopSession = useCallback(() => {
        // 1. Detach Session
        sessionRef.current = null;

        // 2. Tear down Input Pipeline (Microphone)
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
            if (inputAudioContextRef.current.state !== 'closed') {
                inputAudioContextRef.current.close().catch(console.error);
            }
            inputAudioContextRef.current = null;
        }

        // 3. Tear down Output Pipeline (Speakers)
        if (audioContextRef.current) {
            if (audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.error);
            }
            audioContextRef.current = null;
        }

        // 4. Clear Active Audio Sources (Stop speaking immediately)
        sourcesRef.current.forEach(source => {
            try { source.stop(); } catch (e) { /* ignore already stopped */ }
        });
        sourcesRef.current.clear();

        // 5. Reset UI & Animation Frames
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        nextStartTimeRef.current = 0;
        setIsActive(false);
        setIsConnecting(false);
        setIsExecuting(false);
        setVolume(0);
    }, []);

    const startSession = async () => {
        if (isActive || isConnecting) return;

        if (!apiKey) {
            console.error("VoiceAssistant: No API Key provided.");
            // In a real app, toast notification here
            return;
        }

        setIsConnecting(true);

        try {
            const ai = new GoogleGenAI({ apiKey });

            // --- Audio Context Initialization ---
            // We create the contexts *before* the connection to ensure hardware is ready.

            // 1. Input Context (Native Sample Rate)
            const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            inputAudioContextRef.current = inputCtx;

            // 2. Output Context (Fixed 24kHz for Gemini compatibility, though we resample in decode)
            // Note: Gemini Native Audio is typically 24kHz.
            const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContextRef.current = outputCtx;

            // 3. Microphone Stream (with echo cancellation)
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                }
            });
            streamRef.current = stream;

            // 4. Visualizer Setup (FFT)
            const analyzer = inputCtx.createAnalyser();
            analyzer.fftSize = 256;
            analyzer.smoothingTimeConstant = 0.5;
            const visSource = inputCtx.createMediaStreamSource(stream);
            visSource.connect(analyzer);

            const updateVol = () => {
                // Stop loop if context is dead
                if (!inputAudioContextRef.current) return;

                const data = new Uint8Array(analyzer.frequencyBinCount);
                analyzer.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b) / data.length;
                // Normalize 0-255 to 0-100 roughly
                setVolume(Math.min(100, (avg / 128) * 100));
                rafRef.current = requestAnimationFrame(updateVol);
            };
            updateVol();

            // --- Gemini WebSocket Connection ---

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    tools: getToolsDefinition(), // Tools defined below
                    systemInstruction: getSystemInstruction,
                    responseModalities: [Modality.AUDIO], // We want the AI to speak back
                }
            });

            // Assign reference immediately to allow early cancellation
            sessionRef.current = sessionPromise;

            const session = await sessionPromise;

            // --- Event Handlers ---

            session.on('open', () => {
                setIsActive(true);
                setIsConnecting(false);

                // Send initial state so AI knows where it is immediately
                session.sendRealtimeInput([{
                    text: `[SYSTEM_INIT: UI_STATE=${JSON.stringify(modalsState)}]`
                }]);

                // Start Audio Pumping (Input -> API)
                const source = inputCtx.createMediaStreamSource(stream);
                sourceRef.current = source;

                // Using ScriptProcessor (legacy but reliable for this PCM chunking)
                // Buffer size 4096 = ~92ms latency at 44.1kHz, acceptable for this use case
                const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;

                processor.onaudioprocess = (e) => {
                    if (!sessionRef.current) return; // Guard against disconnected state

                    const inputData = e.inputBuffer.getChannelData(0);
                    // Convert to PCM and send
                    const pcmBlob = createPcmBlob(inputData, inputCtx.sampleRate);
                    session.sendRealtimeInput({ media: pcmBlob });
                };

                source.connect(processor);
                processor.connect(inputCtx.destination); // Keep processor alive
            });

            session.on('message', async (message: LiveServerMessage) => {
                // A. Handle Function Calls (The Brain)
                if (message.toolCall) {
                    handleToolCall(message.toolCall);
                }

                // B. Handle Audio Response (The Voice)
                const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (base64Audio && audioContextRef.current) {
                    try {
                        const ctx = audioContextRef.current;
                        // Decode
                        const buffer = await decodeAudioData(
                            new Uint8Array(atob(base64Audio).split('').map(c => c.charCodeAt(0))),
                            ctx
                        );

                        // Schedule strictly monotonic playback
                        const now = ctx.currentTime;
                        // If next start time is in the past, reset it to now (gapless playback handling)
                        if (nextStartTimeRef.current < now) {
                            nextStartTimeRef.current = now;
                        }

                        const source = ctx.createBufferSource();
                        source.buffer = buffer;
                        source.connect(ctx.destination);

                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += buffer.duration;

                        // Track source for cancellation
                        sourcesRef.current.add(source);
                        source.onended = () => sourcesRef.current.delete(source);

                    } catch (err) {
                        console.error("Audio Decode Error:", err);
                    }
                }
            });

            session.on('close', () => {
                console.log("Gemini Session Closed");
                stopSession();
            });

            session.on('error', (err) => {
                console.error("Gemini Session Error:", err);
                stopSession();
            });

        } catch (e) {
            console.error("Connection failed", e);
            setIsConnecting(false);
            // Optional: Add error toast here
        }
    };

    // --- Tool Definitions & Execution Logic ---

    const getToolsDefinition = () => [{
        functionDeclarations: [
            {
                name: 'manage_ui_state',
                description: 'Primary tool for opening/closing modals and changing language.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        action: {
                            type: Type.STRING,
                            enum: ['OPEN_COMPOSITE', 'CLOSE_COMPOSITE', 'OPEN_OCR', 'OPEN_DOCS', 'CHANGE_LANG', 'CLOSE_ALL']
                        },
                        value: { type: Type.STRING, description: "Language code (hu, en) if action is CHANGE_LANG" }
                    },
                    required: ['action']
                }
            },
            {
                name: 'trigger_native_generation',
                description: 'Triggers the main image generation process.',
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
                description: 'Scrolls the main window.',
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
                description: 'Closes the voice assistant.',
                parameters: { type: Type.OBJECT, properties: {} }
            }
        ]
    }];

    const handleToolCall = async (toolCall: any) => {
        setIsExecuting(true);
        const functionResponses = [];

        // Process all function calls in the turn
        for (const fc of toolCall.functionCalls) {
            const { name, args, id } = fc;
            let result = { ok: true, message: "Executed" };

            // Debug log for development
            console.log(`[Assistant Tool] Executing: ${name}`, args);

            try {
                switch (name) {
                    case 'manage_ui_state':
                        onCommand({ uiAction: args.action, value: args.value });
                        result = { ok: true, message: `UI Action ${args.action} dispatched.` };
                        break;

                    case 'trigger_native_generation':
                        onCommand({
                            triggerNative: true,
                            prompt: args.prompt,
                            aspectRatio: args.aspectRatio
                        });
                        result = { ok: true, message: "Generation triggered." };
                        break;

                    case 'scroll_viewport':
                        onCommand({ scrollAction: args.direction });
                        result = { ok: true, message: `Scrolled ${args.direction}` };
                        break;

                    case 'close_assistant':
                        stopSession();
                        result = { ok: true, message: "Session ending." };
                        // Return early to skip further processing
                        return;

                    default:
                        console.warn(`Unknown tool called: ${name}`);
                        result = { ok: false, message: "Tool not found" };
                }
            } catch (e) {
                console.error(`Error executing tool ${name}:`, e);
                result = { ok: false, message: "Execution failed" };
            }

            functionResponses.push({
                id,
                name,
                response: { result }
            });
        }

        // Send execution results back to Gemini so it knows what happened
        if (sessionRef.current && functionResponses.length > 0) {
            const s = await sessionRef.current;
            s.sendToolResponse({ functionResponses });
        }

        // Reset execution state after short delay (visual feedback)
        setTimeout(() => setIsExecuting(false), 500);
    };

    // --- React Effects ---

    // 1. Cleanup on Unmount
    useEffect(() => {
        return () => stopSession();
    }, [stopSession]);

    // 2. Proactive State Synchronization
    useEffect(() => {
        if (isActive && sessionRef.current) {
            sessionRef.current.then((s: any) => {
                s.sendRealtimeInput([{
                    text: `[SYSTEM_EVENT: UI_STATE_CHANGED to ${JSON.stringify(modalsState)}]`
                }]);
            }).catch(() => { });
        }
    }, [modalsState, isActive]);

    // --- Render ---

    if (typeof window === 'undefined') return null; // SSR Protection

    return createPortal(
        <AnimatePresence>
            <motion.div
                drag
                dragMomentum={false}
                whileDrag={{ scale: 1.05 }}
                className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 cursor-move touch-none font-sans select-none"
            >
                {/* Status Indicators Bubble */}
                <AnimatePresence>
                    {isActive && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.9 }}
                            className="flex flex-col items-end gap-2"
                        >
                            {isExecuting && (
                                <div className="bg-purple-600/90 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 border border-purple-400/30">
                                    <Sparkles className="w-3 h-3 animate-spin" />
                                    Processing Action...
                                </div>
                            )}

                            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 text-emerald-400 text-xs font-mono px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3">
                                <div className="flex gap-0.5 items-end h-3">
                                    {/* Audio Visualizer Bars */}
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
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Floating Action Button (FAB) */}
                <motion.button
                    onClick={(e) => {
                        e.stopPropagation();
                        isActive ? stopSession() : startSession();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`
            relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300
            ${isActive
                            ? 'bg-red-500 hover:bg-red-600 shadow-red-500/40 ring-4 ring-red-500/20'
                            : isConnecting
                                ? 'bg-slate-700 ring-4 ring-slate-500/20'
                                : 'bg-gradient-to-br from-indigo-600 to-violet-600 hover:brightness-110 shadow-indigo-500/40 ring-4 ring-indigo-500/20'
                        }
          `}
                >
                    {/* Active Ripple Animation */}
                    {isActive && (
                        <span className="absolute inset-0 rounded-2xl border-2 border-white/40 animate-ping opacity-20"></span>
                    )}

                    {isConnecting ? (
                        <Loader2 className="w-7 h-7 text-white animate-spin" />
                    ) : isActive ? (
                        <Mic className="w-7 h-7 text-white drop-shadow-md" />
                    ) : (
                        <MicOff className="w-7 h-7 text-white/70" />
                    )}

                    {/* Mini Close Button (Quick Exit) */}
                    {isActive && (
                        <div
                            onClick={(e) => { e.stopPropagation(); stopSession(); }}
                            className="absolute -top-2 -right-2 bg-slate-800 text-slate-300 rounded-full p-1.5 hover:bg-red-500 hover:text-white transition-colors border border-white/10 shadow-lg"
                            title="Close Assistant"
                        >
                            <X className="w-3 h-3" />
                        </div>
                    )}
                </motion.button>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

export default VoiceAssistant;