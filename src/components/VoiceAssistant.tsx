import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, Sparkles, X, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { ImageItem } from '../types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

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
    onCommand: (command: AssistantCommand) => void;
    onAudit: () => void;
    onApplyAll: () => void;
    onCompositeUpdate?: (updates: CompositeUpdates) => void;
}

// ============================================================================
// AUDIO UTILITIES
// ============================================================================

/**
 * Converts Float32 PCM audio from microphone to Base64-encoded Int16 PCM for Gemini
 */
function encodePcmAudio(audioData: Float32Array, sampleRate: number): { data: string; mimeType: string } {
    const int16Array = new Int16Array(audioData.length);

    for (let i = 0; i < audioData.length; i++) {
        const clamped = Math.max(-1, Math.min(1, audioData[i]));
        int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    }

    const bytes = new Uint8Array(int16Array.buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return {
        data: btoa(binary),
        mimeType: `audio/pcm;rate=${sampleRate}`
    };
}

/**
 * Decodes Base64-encoded Int16 PCM from Gemini to AudioBuffer for playback
 */
async function decodePcmAudio(
    base64Data: string,
    audioContext: AudioContext,
    sampleRate: number = 24000
): Promise<AudioBuffer> {
    // Decode base64
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    // Convert to Int16
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);

    // Normalize to [-1, 1]
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
    }

    // Create AudioBuffer
    const audioBuffer = audioContext.createBuffer(1, float32Array.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Array);

    return audioBuffer;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

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

    // ========================================================================
    // STATE
    // ========================================================================

    const [isActive, setIsActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [volume, setVolume] = useState(0);

    // ========================================================================
    // REFS
    // ========================================================================

    const sessionRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const inputContextRef = useRef<AudioContext | null>(null);
    const outputContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number | null>(null);

    // Audio playback scheduling
    const nextPlayTimeRef = useRef<number>(0);
    const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    // ========================================================================
    // SYSTEM INSTRUCTIONS
    // ========================================================================

    const systemInstruction = useMemo(() => {
        const isHu = currentLanguage === 'hu';

        const activeUI = [];
        if (modalsState.composite) activeUI.push('COMPOSITE_EDITOR');
        if (modalsState.ocr) activeUI.push('OCR_PANEL');
        if (modalsState.guide) activeUI.push('USER_GUIDE');

        const context = activeUI.length > 0
            ? `[UI: ${activeUI.join(', ')}]`
            : '[UI: MAIN_DASHBOARD]';

        if (isHu) {
            return `
SZEREPLŐ: BananaAI Hangvezérlő Asszisztens
${context}

FELADATOK:
- UI kezelés: "nyisd meg/zárd be X" → manage_ui_state
- Generálás: "generálj/készíts" → trigger_native_generation  
- Navigáció: "görgess le/fel" → scroll_viewport
- Kilépés: "stop/viszlát" → close_assistant

SZABÁLYOK:
✓ Azonnal végrehajt, NEM kérdez vissza
✓ Rövid válaszok: "Rendben", "Kész", "Megnyitva"
✓ Ha bizonytalan, kérdez
✓ Soha ne szakítsd félbe a felhasználót
            `.trim();
        }

        return `
ROLE: BananaAI Voice Control Assistant
${context}

TASKS:
- UI control: "open/close X" → manage_ui_state
- Generation: "generate/create" → trigger_native_generation
- Navigation: "scroll up/down" → scroll_viewport  
- Exit: "stop/bye" → close_assistant

RULES:
✓ Execute immediately, NO confirmation needed
✓ Brief responses: "Done", "Ready", "Opening"
✓ If uncertain, ask
✓ Never interrupt the user
        `.trim();
    }, [currentLanguage, modalsState]);

    // ========================================================================
    // TOOL DEFINITIONS
    // ========================================================================

    const toolsDefinition = useMemo(() => [{
        functionDeclarations: [
            {
                name: 'manage_ui_state',
                description: 'Opens or closes UI panels and modals',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        action: {
                            type: Type.STRING,
                            enum: ['OPEN_COMPOSITE', 'CLOSE_COMPOSITE', 'OPEN_OCR', 'OPEN_DOCS', 'CHANGE_LANG', 'CLOSE_ALL']
                        },
                        value: {
                            type: Type.STRING,
                            description: 'Language code (hu/en) when action is CHANGE_LANG'
                        }
                    },
                    required: ['action']
                }
            },
            {
                name: 'trigger_native_generation',
                description: 'Generates images based on prompt',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        prompt: { type: Type.STRING },
                        aspectRatio: { type: Type.STRING }
                    },
                    required: ['prompt']
                }
            },
            {
                name: 'scroll_viewport',
                description: 'Scrolls the main view',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        direction: {
                            type: Type.STRING,
                            enum: ['UP', 'DOWN', 'TOP', 'BOTTOM']
                        }
                    },
                    required: ['direction']
                }
            },
            {
                name: 'close_assistant',
                description: 'Closes the voice assistant',
                parameters: {
                    type: Type.OBJECT,
                    properties: {}
                }
            }
        ]
    }], []);

    // ========================================================================
    // TOOL HANDLER
    // ========================================================================

    const handleToolCall = useCallback(async (toolCall: any) => {
        setIsExecuting(true);
        const responses = [];

        for (const fc of toolCall.functionCalls) {
            const { name, args, id } = fc;
            console.log(`[Tool] ${name}:`, args);

            let result = { success: true };

            try {
                switch (name) {
                    case 'manage_ui_state':
                        onCommand({ uiAction: args.action, value: args.value });
                        break;

                    case 'trigger_native_generation':
                        onCommand({
                            triggerNative: true,
                            prompt: args.prompt,
                            aspectRatio: args.aspectRatio
                        });
                        break;

                    case 'scroll_viewport':
                        onCommand({ scrollAction: args.direction });
                        break;

                    case 'close_assistant':
                        stopSession();
                        return;

                    default:
                        result = { success: false };
                }
            } catch (error) {
                console.error(`[Tool Error] ${name}:`, error);
                result = { success: false };
            }

            responses.push({ id, name, response: { result } });
        }

        // Send responses back to Gemini
        if (sessionRef.current && responses.length > 0) {
            try {
                await sessionRef.current.sendToolResponse({ functionResponses: responses });
            } catch (error) {
                console.warn('[Tool Response] Failed to send:', error);
            }
        }

        setTimeout(() => setIsExecuting(false), 500);
    }, [onCommand]);

    // ========================================================================
    // SESSION LIFECYCLE
    // ========================================================================

    const stopSession = useCallback(() => {
        console.log('[Session] Stopping...');

        // Stop session
        sessionRef.current = null;

        // Stop mic input
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
        if (inputContextRef.current?.state !== 'closed') {
            inputContextRef.current?.close();
            inputContextRef.current = null;
        }

        // Stop audio output
        if (outputContextRef.current?.state !== 'closed') {
            outputContextRef.current?.close();
            outputContextRef.current = null;
        }

        activeSourcesRef.current.forEach(source => {
            try { source.stop(); } catch { }
        });
        activeSourcesRef.current.clear();

        // Stop visualizer
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        // Reset state
        nextPlayTimeRef.current = 0;
        setIsActive(false);
        setIsConnecting(false);
        setIsExecuting(false);
        setVolume(0);
    }, []);

    const startSession = useCallback(async () => {
        if (isActive || isConnecting) return;

        setHasError(false);

        if (!apiKey) {
            console.error('[Session] No API key');
            setHasError(true);
            return;
        }

        setIsConnecting(true);

        try {
            // ================================================================
            // 1. ACQUIRE MICROPHONE
            // ================================================================

            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        channelCount: 1
                    }
                });
            } catch (err) {
                console.warn('[Audio] Fallback to basic settings');
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            streamRef.current = stream;

            // ================================================================
            // 2. SETUP AUDIO CONTEXTS
            // ================================================================

            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;

            // Input (native sample rate)
            const inputCtx = new AudioCtx();
            inputContextRef.current = inputCtx;
            if (inputCtx.state === 'suspended') await inputCtx.resume();

            // Output (24kHz for Gemini)
            const outputCtx = new AudioCtx({ sampleRate: 24000 });
            outputContextRef.current = outputCtx;
            if (outputCtx.state === 'suspended') await outputCtx.resume();

            // ================================================================
            // 3. SETUP VISUALIZER
            // ================================================================

            const analyser = inputCtx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;

            const visSource = inputCtx.createMediaStreamSource(stream);
            visSource.connect(analyser);

            const updateVisualizer = () => {
                if (!inputContextRef.current) return;

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                setVolume(Math.min(100, (average / 128) * 100));

                rafRef.current = requestAnimationFrame(updateVisualizer);
            };
            updateVisualizer();

            // ================================================================
            // 4. CONNECT TO GEMINI
            // ================================================================

            const ai = new GoogleGenAI({ apiKey });
            const session = await ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    tools: toolsDefinition,
                    systemInstruction: systemInstruction,
                    responseModalities: [Modality.AUDIO] // CRITICAL: Enable audio responses
                }
            });

            sessionRef.current = session;

            // ================================================================
            // 5. SESSION EVENT HANDLERS
            // ================================================================

            session.on('open', () => {
                console.log('[Session] Connected');
                setIsActive(true);
                setIsConnecting(false);

                // Send initial context
                session.sendRealtimeInput([{
                    text: `[INIT] UI=${JSON.stringify(modalsState)}`
                }]);

                // Start audio pipeline: Microphone → Gemini
                const micSource = inputCtx.createMediaStreamSource(stream);
                sourceRef.current = micSource;

                const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;

                processor.onaudioprocess = (e) => {
                    if (!sessionRef.current) return;

                    const audioData = e.inputBuffer.getChannelData(0);
                    const encoded = encodePcmAudio(audioData, inputCtx.sampleRate);

                    session.sendRealtimeInput({ media: encoded });
                };

                micSource.connect(processor);
                processor.connect(inputCtx.destination);
            });

            session.on('message', async (message: LiveServerMessage) => {
                // Handle tool calls
                if (message.toolCall) {
                    handleToolCall(message.toolCall);
                }

                // Handle audio response
                const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audioData && outputContextRef.current) {
                    try {
                        const buffer = await decodePcmAudio(audioData, outputContextRef.current);

                        const now = outputContextRef.current.currentTime;
                        if (nextPlayTimeRef.current < now) {
                            nextPlayTimeRef.current = now;
                        }

                        const source = outputContextRef.current.createBufferSource();
                        source.buffer = buffer;
                        source.connect(outputContextRef.current.destination);
                        source.start(nextPlayTimeRef.current);

                        nextPlayTimeRef.current += buffer.duration;

                        activeSourcesRef.current.add(source);
                        source.onended = () => activeSourcesRef.current.delete(source);

                    } catch (error) {
                        console.error('[Audio] Decode failed:', error);
                    }
                }
            });

            session.on('close', () => {
                console.log('[Session] Closed');
                stopSession();
            });

            session.on('error', (error: any) => {
                console.error('[Session] Error:', error);
                setHasError(true);
                stopSession();
            });

        } catch (error) {
            console.error('[Session] Start failed:', error);
            setHasError(true);
            setIsConnecting(false);
            stopSession();
        }
    }, [isActive, isConnecting, apiKey, modalsState, systemInstruction, toolsDefinition, handleToolCall, stopSession]);

    // ========================================================================
    // EFFECTS
    // ========================================================================

    // Cleanup on unmount
    useEffect(() => {
        return () => stopSession();
    }, [stopSession]);

    // Sync UI state to AI
    useEffect(() => {
        if (isActive && sessionRef.current) {
            sessionRef.current.sendRealtimeInput([{
                text: `[UPDATE] UI=${JSON.stringify(modalsState)}`
            }]).catch(() => { });
        }
    }, [modalsState, isActive]);

    // ========================================================================
    // RENDER
    // ========================================================================

    if (typeof window === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                drag
                dragMomentum={false}
                whileDrag={{ scale: 1.05 }}
                className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 cursor-move touch-none select-none"
            >
                {/* Status Indicators */}
                <AnimatePresence>
                    {(isActive || hasError) && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.9 }}
                            className="flex flex-col items-end gap-2"
                        >
                            {hasError && (
                                <div className="bg-red-600/90 backdrop-blur-md text-white text-[10px] font-bold uppercase px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 border border-red-400/30">
                                    <AlertCircle className="w-3 h-3" />
                                    Connection Failed
                                </div>
                            )}

                            {isActive && isExecuting && (
                                <div className="bg-purple-600/90 backdrop-blur-md text-white text-[10px] font-bold uppercase px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 border border-purple-400/30">
                                    <Sparkles className="w-3 h-3 animate-spin" />
                                    Processing
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
                            <span className="absolute inset-0 rounded-2xl border-2 border-white/40 animate-ping opacity-20" />
                        )}

                        {isConnecting ? (
                            <Loader2 className="w-7 h-7 text-white animate-spin" />
                        ) : hasError ? (
                            <AlertCircle className="w-7 h-7 text-white" />
                        ) : isActive ? (
                            <Mic className="w-7 h-7 text-white" />
                        ) : (
                            <MicOff className="w-7 h-7 text-white/70" />
                        )}

                        {(isActive || hasError) && (
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    stopSession();
                                    setHasError(false);
                                }}
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