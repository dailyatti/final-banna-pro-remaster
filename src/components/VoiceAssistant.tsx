import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, Tool } from '@google/genai';
import { Mic, MicOff, Loader2, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

// --- TYPE DEFINITIONS ---

// Define strict types for the external props to ensure integration safety
interface VoiceAssistantProps {
    apiKey: string;
    // Commands are generic actions passed back to the main app
    onCommand: (command: AssistantCommand) => void;
    onAudit: () => void;
    onApplyAll: () => void;
    onCompositeUpdate?: (updates: any) => void;
    currentLanguage: string;
    // Image context
    images?: any[];
    // State flags
    batchCompleteTrigger?: number;
    nativePrompt?: string;
    isNativeGenerating?: boolean;
    modalsState?: {
        composite: boolean;
        ocr: boolean;
        guide: boolean;
        langMenu?: boolean;
        [key: string]: any; // Allow extensibility
    };
}

// Unified Command Interface
interface AssistantCommand {
    type?: string;
    updateNative?: boolean;
    triggerNative?: boolean;
    startQueue?: boolean;
    uiAction?: string;
    itemAction?: string;
    [key: string]: any;
}

// Audio Constants
const AUDIO_SAMPLE_RATE = 24000; // Gemini native output rate
const INPUT_SAMPLE_RATE_fallback = 48000;

// --- UTILITIES (Pure Functions) ---

/**
 * Converts Float32 audio data to Int16 PCM for Gemini API.
 * Optimized for low latency.
 */
function floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
}

/**
 * Base64 encoding/decoding helpers
 */
const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

const base64ToArrayBuffer = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

// --- CUSTOM HOOK: useGeminiLive ---
/**
 * Encapsulates the complexity of WebSocket management, AudioContexts, and Tool routing.
 */
const useGeminiLive = ({
    apiKey,
    systemInstruction,
    tools,
    onToolCall,
}: {
    apiKey: string;
    systemInstruction: string;
    tools: Tool[];
    onToolCall: (name: string, args: any) => Promise<any>;
}) => {
    const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [volume, setVolume] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);

    // Refs for persistence across renders without triggering re-renders
    const sessionRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const inputContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const nextPlayTimeRef = useRef<number>(0);
    const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);

    // Cleanup function to strictly close all audio resources
    const disconnect = useCallback(async () => {
        setStatus('idle');
        setVolume(0);

        if (sessionRef.current) {
            // No strict close method on some SDK versions, but we nullify the ref
            sessionRef.current = null;
        }

        // Stop Microphone Stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // Close Audio Contexts
        if (inputContextRef.current) {
            await inputContextRef.current.close();
            inputContextRef.current = null;
        }
        if (audioContextRef.current) {
            await audioContextRef.current.close();
            audioContextRef.current = null;
        }

        // Stop Script Processor
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        // Stop all playing audio
        audioQueueRef.current.forEach(source => {
            try { source.stop(); } catch (e) { }
        });
        audioQueueRef.current = [];
    }, []);

    const connect = useCallback(async () => {
        if (!apiKey) {
            toast.error("API Key missing");
            return;
        }

        setStatus('connecting');

        try {
            // 1. Initialize Audio Output Context (Speakers)
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: AUDIO_SAMPLE_RATE
            });
            audioContextRef.current = audioCtx;
            nextPlayTimeRef.current = audioCtx.currentTime;

            // 2. Initialize Microphone Input
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: INPUT_SAMPLE_RATE_fallback
                }
            });
            streamRef.current = stream;

            const streamSettings = stream.getAudioTracks()[0].getSettings();
            const actualSampleRate = streamSettings.sampleRate || INPUT_SAMPLE_RATE_fallback;

            const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: actualSampleRate
            });
            inputContextRef.current = inputCtx;

            // 3. Setup Analyzer (Visualizer)
            const analyzer = inputCtx.createAnalyser();
            analyzer.fftSize = 256;
            const source = inputCtx.createMediaStreamSource(stream);
            source.connect(analyzer);

            // Volume monitoring loop
            const checkVolume = () => {
                if (inputCtx.state === 'closed') return;
                const dataArray = new Uint8Array(analyzer.frequencyBinCount);
                analyzer.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                setVolume(avg);
                requestAnimationFrame(checkVolume);
            };
            checkVolume();

            // 4. Initialize Gemini Session
            const client = new GoogleGenAI({ apiKey });

            // Connect using the Live API
            const session = await client.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    tools: tools,
                    systemInstruction: systemInstruction,
                    responseModalities: [Modality.AUDIO], // We want the AI to speak back
                },
            });

            // 5. Setup Audio Processing (Mic -> Gemini)
            // Use ScriptProcessor (legacy but reliable for raw PCM) or AudioWorklet in prod
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                // Downsample or convert if necessary, here we send raw PCM 
                // but we must tell Gemini the correct rate
                const pcm16 = floatTo16BitPCM(inputData);
                const base64Data = arrayBufferToBase64(pcm16.buffer);

                session.sendRealtimeInput({
                    media: {
                        mimeType: `audio/pcm;rate=${actualSampleRate}`,
                        data: base64Data
                    }
                });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination); // Required for processing to happen

            // 6. Handle Incoming Messages (Gemini -> Speakers)
            // @ts-ignore - Callback types can be tricky in the SDK preview
            session.on('content', (content: any) => {
                // Handle Audio
                const base64Audio = content.modelTurn?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
                if (base64Audio && audioCtx) {
                    const audioData = base64ToArrayBuffer(base64Audio);
                    const int16Data = new Int16Array(audioData);
                    const float32Data = new Float32Array(int16Data.length);

                    // Convert back to Float32 for WebAudio
                    for (let i = 0; i < int16Data.length; i++) {
                        float32Data[i] = int16Data[i] / 32768.0;
                    }

                    const buffer = audioCtx.createBuffer(1, float32Data.length, AUDIO_SAMPLE_RATE);
                    buffer.getChannelData(0).set(float32Data);

                    const sourceNode = audioCtx.createBufferSource();
                    sourceNode.buffer = buffer;
                    sourceNode.connect(audioCtx.destination);

                    // Schedule playback without gaps
                    const startTime = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
                    sourceNode.start(startTime);
                    nextPlayTimeRef.current = startTime + buffer.duration;

                    audioQueueRef.current.push(sourceNode);
                    sourceNode.onended = () => {
                        audioQueueRef.current = audioQueueRef.current.filter(s => s !== sourceNode);
                    };
                }
            });

            // @ts-ignore
            session.on('toolCall', async (toolCall: any) => {
                setIsProcessing(true);
                const responses = [];

                for (const fc of toolCall.functionCalls) {
                    console.log(`[Assistant] Executing: ${fc.name}`, fc.args);
                    try {
                        const result = await onToolCall(fc.name, fc.args);
                        responses.push({
                            name: fc.name,
                            id: fc.id,
                            response: { result: result }
                        });
                    } catch (err: any) {
                        console.error(`Tool error: ${fc.name}`, err);
                        responses.push({
                            name: fc.name,
                            id: fc.id,
                            response: { error: err.message || "Unknown error" }
                        });
                    }
                }

                session.sendToolResponse({ functionResponses: responses });
                setIsProcessing(false);
            });

            sessionRef.current = session;
            setStatus('connected');

        } catch (error) {
            console.error("Connection failed:", error);
            disconnect();
            setStatus('error');
            toast.error("Failed to connect to Voice Assistant");
        }
    }, [apiKey, systemInstruction, tools, onToolCall, disconnect]);

    return { connect, disconnect, status, volume, isProcessing, session: sessionRef.current };
};


// --- MAIN COMPONENT ---

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
    // UI State for Scrolling
    const [isScrolling, setIsScrolling] = useState(false);
    const [scrollDirection, setScrollDirection] = useState<'UP' | 'DOWN'>('DOWN');

    // Refs to break closures in the tool callbacks
    const propsRef = useRef({ onCommand, onAudit, onApplyAll, onCompositeUpdate, images, modalsState, currentLanguage });

    // Sync refs constantly
    useEffect(() => {
        propsRef.current = { onCommand, onAudit, onApplyAll, onCompositeUpdate, images, modalsState, currentLanguage };
    }, [onCommand, onAudit, onApplyAll, onCompositeUpdate, images, modalsState, currentLanguage]);

    // --- SCROLLING LOGIC ---
    // Smooth scrolling loop using requestAnimationFrame
    useEffect(() => {
        let animationId: number;
        const scrollLoop = () => {
            if (isScrolling) {
                const amount = scrollDirection === 'DOWN' ? 4 : -4; // Speed
                window.scrollBy({ top: amount, behavior: 'auto' });

                // Boundary checks to stop scrolling automatically
                const isBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight;
                const isTop = window.scrollY <= 0;

                if ((scrollDirection === 'DOWN' && isBottom) || (scrollDirection === 'UP' && isTop)) {
                    setIsScrolling(false);
                } else {
                    animationId = requestAnimationFrame(scrollLoop);
                }
            }
        };

        if (isScrolling) {
            animationId = requestAnimationFrame(scrollLoop);
        }
        return () => cancelAnimationFrame(animationId);
    }, [isScrolling, scrollDirection]);

    // --- TOOL DEFINITIONS ---
    // Memoized to prevent re-creation
    const tools = useMemo<Tool[]>(() => [{
        functionDeclarations: [
            {
                name: 'get_system_state',
                description: 'CRITICAL: Call this whenever you need to know where you are, what is open, or the current scroll position.',
                parameters: { type: Type.OBJECT, properties: {} }
            },
            {
                name: 'control_scroll',
                description: 'Controls page scrolling. START/STOP for continuous reading/scanning, STEP for jumps.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        action: { type: Type.STRING, enum: ['START', 'STOP', 'STEP', 'TOP', 'BOTTOM'] },
                        direction: { type: Type.STRING, enum: ['UP', 'DOWN'] }
                    },
                    required: ['action']
                }
            },
            {
                name: 'manage_ui_state',
                description: 'Opens/Closes modals, menus, or changes language.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        action: { type: Type.STRING, enum: ['OPEN_COMPOSITE', 'OPEN_OCR', 'OPEN_DOCS', 'CHANGE_LANG', 'CLOSE_ALL', 'CLOSE_COMPOSITE', 'CLOSE_OCR'] },
                        value: { type: Type.STRING, description: "Optional value (e.g., lang code 'hu')" }
                    }
                }
            },
            {
                name: 'trigger_action',
                description: 'Executes app-specific commands like generating images, running audits, etc.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        command: { type: Type.STRING, enum: ['GENERATE', 'AUDIT', 'APPLY_ALL', 'CLEAR_QUEUE', 'DOWNLOAD'] },
                        payload: { type: Type.STRING, description: "JSON stringified payload if needed" }
                    }
                }
            },
            {
                name: 'update_composite',
                description: 'Updates the Composite Generator settings ONLY when that modal is open.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        prompt: { type: Type.STRING },
                        aspectRatio: { type: Type.STRING },
                        resolution: { type: Type.STRING }
                    }
                }
            }
        ]
    }], []);

    // --- TOOL HANDLER ---
    // This function runs when the AI decides to call a tool
    const handleToolCall = async (name: string, args: any) => {
        const { onCommand, onAudit, onApplyAll, onCompositeUpdate, modalsState, images } = propsRef.current;

        switch (name) {
            case 'get_system_state':
                // PhD Level Context Awareness: Calculate exact position
                const scrollPct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
                const visibleState = {
                    language: propsRef.current.currentLanguage,
                    modals: modalsState,
                    imagesInQueue: images?.length || 0,
                    scroll: {
                        isAtTop: window.scrollY === 0,
                        isAtBottom: window.innerHeight + window.scrollY >= document.body.scrollHeight - 10,
                        percentage: isNaN(scrollPct) ? 0 : scrollPct,
                        direction: isScrolling ? scrollDirection : 'STOPPED'
                    }
                };
                return JSON.stringify(visibleState);

            case 'control_scroll':
                if (args.action === 'START') {
                    setScrollDirection(args.direction || 'DOWN');
                    setIsScrolling(true);
                    return "Scrolling started.";
                } else if (args.action === 'STOP') {
                    setIsScrolling(false);
                    return "Scrolling stopped.";
                } else if (args.action === 'STEP') {
                    const amt = args.direction === 'UP' ? -window.innerHeight * 0.7 : window.innerHeight * 0.7;
                    window.scrollBy({ top: amt, behavior: 'smooth' });
                    return "Scrolled one page step.";
                } else if (args.action === 'TOP') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return "Jumped to top.";
                } else if (args.action === 'BOTTOM') {
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    return "Jumped to bottom.";
                }
                break;

            case 'manage_ui_state':
                onCommand({ uiAction: args.action, value: args.value });
                return "UI State updated.";

            case 'trigger_action':
                if (args.command === 'GENERATE') onCommand({ triggerNative: true });
                if (args.command === 'AUDIT') onAudit();
                if (args.command === 'APPLY_ALL') onApplyAll();
                if (args.command === 'CLEAR_QUEUE') onCommand({ action: 'CLEAR_ALL' });
                return `Command ${args.command} executed.`;

            case 'update_composite':
                if (onCompositeUpdate && modalsState?.composite) {
                    onCompositeUpdate(args);
                    return "Composite settings updated.";
                }
                return "Error: Composite modal is not open.";

            default:
                return "Tool not found.";
        }
    };

    // --- SYSTEM PROMPT ---
    const getSystemInstruction = () => {
        const lang = propsRef.current.currentLanguage;
        // Dynamic prompt based on language
        return `
        You are BananaAI, an advanced, omniscient interface assistant.
        
        CURRENT LANGUAGE: ${lang}
        
        CORE PROTOCOLS:
        1. CONTEXT AWARENESS: Before executing actions, you often check 'get_system_state' to know if modals are open or where you are on the page.
        2. SCROLLING: You can scroll the page. If the user says "Read this to me" or "Look through", use 'control_scroll' to scan. Always know if you are at the top or bottom.
        3. MODALS: You can open and close ANY modal (Composite, OCR, Docs). If the user wants to change settings, ensure the relevant modal is open first.
        4. PRECISE CONTROL: When generating images, do not ask for confirmation. Just do it.
        
        BEHAVIOR:
        - Concise, professional, helpful.
        - If the user asks to "Go down", assume they want to scroll.
        - If the user asks "Where are we?", use 'get_system_state' and explain the UI state.
        `;
    };

    // --- INIT HOOK ---
    const { connect, disconnect, status, volume, isProcessing } = useGeminiLive({
        apiKey,
        systemInstruction: getSystemInstruction(),
        tools,
        onToolCall: handleToolCall
    });

    // --- RENDER ---
    return (
        <motion.div
            drag
            dragMomentum={false}
            whileDrag={{ scale: 1.1 }}
            className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 touch-none"
        >
            <AnimatePresence>
                {status === 'connected' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        className="flex flex-col items-end gap-2"
                    >
                        {/* Status Bubble */}
                        <div className="bg-slate-900/90 backdrop-blur-md border border-emerald-500/30 text-emerald-400 text-xs px-4 py-2 rounded-2xl shadow-xl flex items-center gap-3">
                            {isProcessing ? (
                                <>
                                    <Sparkles className="w-3 h-3 animate-spin text-purple-400" />
                                    <span className="text-purple-200 font-medium">Processing...</span>
                                </>
                            ) : isScrolling ? (
                                <>
                                    {scrollDirection === 'UP' ? <ChevronUp className="w-3 h-3 animate-bounce" /> : <ChevronDown className="w-3 h-3 animate-bounce" />}
                                    <span>Scrolling...</span>
                                </>
                            ) : (
                                <>
                                    <div className="flex gap-0.5 items-end h-3">
                                        <motion.div animate={{ height: Math.max(4, volume * 0.8) }} className="w-1 bg-emerald-400 rounded-full" />
                                        <motion.div animate={{ height: Math.max(6, volume * 1.2) }} className="w-1 bg-emerald-400 rounded-full" />
                                        <motion.div animate={{ height: Math.max(4, volume * 0.8) }} className="w-1 bg-emerald-400 rounded-full" />
                                    </div>
                                    <span>Listening</span>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Button */}
            <motion.button
                onClick={status === 'connected' ? disconnect : connect}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`
                    relative w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300
                    ${status === 'connected'
                        ? 'bg-red-500 hover:bg-red-600 ring-4 ring-red-500/20'
                        : status === 'connecting'
                            ? 'bg-slate-700 cursor-wait'
                            : 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:shadow-emerald-500/50 ring-0 hover:ring-4 ring-emerald-500/30'
                    }
                `}
            >
                {status === 'connected' && (
                    <motion.div
                        className="absolute inset-0 rounded-full border-2 border-white/40"
                        animate={{ scale: 1 + (volume / 100) * 0.5, opacity: 1 - (volume / 200) }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    />
                )}

                {status === 'connecting' ? (
                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                ) : status === 'connected' ? (
                    <Mic className="w-7 h-7 text-white drop-shadow-md" />
                ) : (
                    <MicOff className="w-7 h-7 text-white/90" />
                )}
            </motion.button>
        </motion.div>
    );
};
