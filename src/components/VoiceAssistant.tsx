import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, Sparkles, X, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { ImageItem } from '../types';

// --- Interfaces & Types ---

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
  // Callbacks
  onCommand: (command: AssistantCommand) => void;
  onAudit: () => void;
  onApplyAll: () => void;
  onCompositeUpdate?: (updates: any) => void;
}

// Unified Command Interface for parent communication
export interface AssistantCommand {
  type?: 'UI_ACTION' | 'SCROLL' | 'UPDATE_DASHBOARD' | 'NATIVE_INPUT' | 'TRIGGER_GEN' | 'ITEM_ACTION' | 'QUEUE_ACTION';
  uiAction?: string;
  value?: string;
  scrollAction?: string;
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

// --- Audio Processing Helpers ---

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
 * Includes clamping to prevent clipping distortion.
 */
function createPcmBlob(data: Float32Array, sampleRate: number): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  
  for (let i = 0; i < l; i++) {
    // Clamp values between -1 and 1 before converting
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  // Convert buffer to binary string
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return {
    data: btoa(binary),
    mimeType: `audio/pcm;rate=${sampleRate}`, // Critical: Inform API of actual hardware rate
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
  
  // State
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [volume, setVolume] = useState(0);

  // Refs for Cleanup & Logic
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const rafRef = useRef<number | null>(null);

  // --- System Prompt Generation ---
  
  const getSystemInstruction = useMemo(() => {
    const isHu = currentLanguage === 'hu';
    // Dynamic context injection
    const context = modalsState.composite
      ? (isHu ? "JELENLEG A 'COMPOSITE' (KÉPÖSSZEOLVASZTÓ) MÓDBAN VAGY. MINDEN KÉP PARANCS IDE VONATKOZIK." : "YOU ARE CURRENTLY IN 'COMPOSITE' MODE. ALL IMAGE COMMANDS APPLY HERE.")
      : "";

    // Base Prompt (Polyglot capability)
    const basePrompt = isHu ? `
      SZEREPLŐ: BananaAI Rendszergazda (PhD szintű, laza de profi).
      FELADAT: A felhasználói utasítások AZONNALI végrehajtása az UI eszközökkel.
      ${context}

      PARANCS SZÓTÁR:
      - ABALKOK/MODALOK: "nyisd meg a...", "zárd be", "lépj ki", "mutasd a...". Használd: 'manage_ui_state'.
      - GENERÁLÁS: "told neki", "mehet", "generáld", "csináld". Használd: 'trigger_native_generation'.
      - BEZÁRÁS: "kuss", "elég", "zárj be".

      FONTOS:
      1. Ha a felhasználó ablakot akar nyitni/zárni (OCR, Composite, Súgó), azonnal hívd a 'manage_ui_state'-et.
      2. Ne beszélj feleslegesen. Ha megcsináltad, elég annyi: "Megvan." vagy "Intézem."
    ` : `
      ROLE: BananaAI System Admin (Expert Level).
      TASK: Execute user interface commands IMMEDIATELY.
      ${context}

      COMMAND DICTIONARY:
      - WINDOWS/MODALS: "open...", "close...", "show me...". Use: 'manage_ui_state'.
      - GENERATE: "do it", "generate", "make it". Use: 'trigger_native_generation'.
      - SILENCE: "stop", "shut up".

      CRITICAL:
      1. If user wants to open/close windows (OCR, Composite, Docs), call 'manage_ui_state' immediately.
      2. Be concise.
    `;

    return basePrompt;
  }, [currentLanguage, modalsState.composite]);

  // --- Session Management ---

  const stopSession = useCallback(() => {
    // 1. Close Gemini Session
    sessionRef.current = null;

    // 2. Stop Recording Pipeline
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
      inputAudioContextRef.current.close().catch(console.error);
      inputAudioContextRef.current = null;
    }

    // 3. Stop Playback Pipeline
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    
    // 4. Clear Queued Audio
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { /* ignore */ }
    });
    sourcesRef.current.clear();
    
    // 5. Reset UI State
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    nextStartTimeRef.current = 0;
    setIsActive(false);
    setIsConnecting(false);
    setIsExecuting(false);
    setVolume(0);
  }, []);

  const startSession = async () => {
    if (isActive || isConnecting) return;
    if (!apiKey) {
      alert("API Key missing.");
      return;
    }

    setIsConnecting(true);

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      // --- Audio Setup ---
      // Use standard context first, allow browser to dictate sample rate
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      inputAudioContextRef.current = inputCtx;
      
      // Output context (Gemini Native usually 24k, but we decode to context rate)
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;
      
      // Get Mic Stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;

      // Visualizer
      const analyzer = inputCtx.createAnalyser();
      analyzer.fftSize = 256;
      const visSource = inputCtx.createMediaStreamSource(stream);
      visSource.connect(analyzer);

      const updateVol = () => {
        if (!isActive && !isConnecting) return;
        const data = new Uint8Array(analyzer.frequencyBinCount);
        analyzer.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b) / data.length;
        setVolume(avg);
        rafRef.current = requestAnimationFrame(updateVol);
      };
      updateVol();

      // --- Gemini Connection ---
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          tools: getToolsDefinition(), // Defined below
          systemInstruction: getSystemInstruction,
          responseModalities: [Modality.AUDIO],
        }
      });

      // --- Callbacks ---

      // 1. OPEN
      (await sessionPromise).on('open', () => {
        setIsActive(true);
        setIsConnecting(false);

        // Send initial context immediately
        sessionRef.current.then((s: any) => {
           sendSystemState(s);
        });

        // Start Audio Pumping
        const source = inputCtx.createMediaStreamSource(stream);
        sourceRef.current = source;
        
        // Use ScriptProcessor (Legacy but reliable for raw PCM extraction in React w/o Worklet file)
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          // Send with ACTUAL hardware sample rate
          const pcmBlob = createPcmBlob(inputData, inputCtx.sampleRate);
          sessionRef.current.then((s: any) => s.sendRealtimeInput({ media: pcmBlob }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination); // Essential to keep processor alive
      });

      // 2. MESSAGE (Audio & Tools)
      (await sessionPromise).on('message', async (message: LiveServerMessage) => {
        // A. Tool Handling
        if (message.toolCall) {
          handleToolCall(message.toolCall);
        }

        // B. Audio Playback
        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio && outputCtx) {
          try {
            // Ensure strictly monotonic time
            const now = outputCtx.currentTime;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, now);
            
            const buffer = await decodeAudioData(
              new Uint8Array(atob(base64Audio).split('').map(c => c.charCodeAt(0))), 
              outputCtx
            );
            
            const source = outputCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(outputCtx.destination);
            source.start(nextStartTimeRef.current);
            
            nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(source);
            source.onended = () => sourcesRef.current.delete(source);
          } catch (err) {
            console.error("Audio decode error", err);
          }
        }
      });

      // 3. CLOSE/ERROR
      (await sessionPromise).on('close', stopSession);
      (await sessionPromise).on('error', (err) => {
        console.error(err);
        stopSession();
      });

      sessionRef.current = sessionPromise;

    } catch (e) {
      console.error("Connection failed", e);
      setIsConnecting(false);
      alert("Could not connect to Voice Assistant.");
    }
  };

  // --- Tool Definitions & Handling ---

  const getToolsDefinition = () => [{
    functionDeclarations: [
      {
        name: 'manage_ui_state',
        description: 'Opens/Closes modals (Composite, OCR, Docs) or changes language.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ['OPEN_COMPOSITE', 'CLOSE_COMPOSITE', 'OPEN_OCR', 'OPEN_DOCS', 'CHANGE_LANG', 'CLOSE_ALL'] },
            value: { type: Type.STRING, description: "Language code if needed (hu, en)" }
          },
          required: ['action']
        }
      },
      {
        name: 'trigger_native_generation',
        description: 'Triggers the main image generation.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING },
            aspectRatio: { type: Type.STRING }
          }
        }
      },
      {
        name: 'get_system_state',
        description: 'Reads current UI state.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'close_assistant',
        description: 'Stops the voice assistant.',
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

      // Log for debugging
      console.log(`[Assistant] Tool Call: ${name}`, args);

      try {
        switch (name) {
          case 'manage_ui_state':
            // Directly map API args to our unified Command interface
            onCommand({ uiAction: args.action, value: args.value });
            result = { ok: true, message: `Executed UI Action: ${args.action}` };
            break;

          case 'trigger_native_generation':
            onCommand({ 
              triggerNative: true, 
              prompt: args.prompt,
              aspectRatio: args.aspectRatio 
            });
            result = { ok: true, message: "Generation started." };
            break;

          case 'get_system_state':
            result = { ok: true, message: JSON.stringify(modalsState) };
            break;

          case 'close_assistant':
            stopSession();
            result = { ok: true, message: "Goodbye." };
            break;
            
          default:
            result = { ok: false, message: "Unknown tool" };
        }
      } catch (e) {
        result = { ok: false, message: "Error executing command" };
      }

      functionResponses.push({
        id,
        name,
        response: { result }
      });
    }

    // Send response back to Gemini
    if (sessionRef.current && functionResponses.length > 0) {
      sessionRef.current.then((s: any) => s.sendToolResponse({ functionResponses }));
    }
    
    setTimeout(() => setIsExecuting(false), 600);
  };

  const sendSystemState = (session: any) => {
    session.sendRealtimeInput([{ 
      text: `[SYSTEM STATE UPDATE: Modals Open: ${JSON.stringify(modalsState)}. Current Language: ${currentLanguage}. Images Loaded: ${images.length}]` 
    }]);
  };

  // --- React Effects ---

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSession();
  }, [stopSession]);

  // Watch for Modal changes to inform AI implicitly
  useEffect(() => {
    if (isActive && sessionRef.current) {
      sessionRef.current.then((s: any) => sendSystemState(s));
    }
  }, [modalsState, isActive]);

  // Batch Completion Trigger
  useEffect(() => {
    if (batchCompleteTrigger > 0 && isActive && sessionRef.current) {
      sessionRef.current.then((s: any) => {
        s.sendRealtimeInput([{ text: "[SYSTEM EVENT: Batch Generation Complete. Notify User.]" }]);
      });
    }
  }, [batchCompleteTrigger, isActive]);


  // --- Render ---

  return createPortal(
    <AnimatePresence>
      <motion.div
        drag
        dragMomentum={false}
        whileDrag={{ scale: 1.05 }}
        className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 cursor-move touch-none font-sans"
      >
        {/* Status Indicators */}
        <AnimatePresence>
          {isActive && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: 10 }}
              className="flex flex-col items-end gap-2"
            >
              {isExecuting && (
                <div className="bg-purple-900/90 backdrop-blur-md border border-purple-500/50 text-purple-200 text-xs font-semibold px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                  PROCESSING...
                </div>
              )}
              
              <div className="bg-slate-900/90 backdrop-blur-md border border-emerald-500/30 text-emerald-400 text-xs font-mono px-4 py-2 rounded-lg shadow-lg flex items-center gap-3">
                <div className="flex gap-1 items-end h-3">
                  {[1, 2, 3].map(i => (
                    <motion.div 
                      key={i}
                      className="w-1 bg-emerald-500 rounded-full"
                      animate={{ height: Math.max(4, Math.min(12, volume * 0.5 * i)) }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    />
                  ))}
                </div>
                <span>LIVE</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            isActive ? stopSession() : startSession();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`
            relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 border border-white/10
            ${isActive 
              ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' 
              : isConnecting
                ? 'bg-slate-700'
                : 'bg-gradient-to-br from-emerald-600 to-teal-700 hover:brightness-110 shadow-emerald-500/30'
            }
          `}
        >
          {/* Ripple Effect when Active */}
          {isActive && (
            <span className="absolute inset-0 rounded-2xl border-2 border-white/40 animate-ping opacity-20"></span>
          )}

          {isConnecting ? (
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          ) : isActive ? (
            <Mic className="w-7 h-7 text-white" />
          ) : (
            <MicOff className="w-7 h-7 text-white/70" />
          )}

          {/* Close Handle (Mini) */}
          {isActive && (
            <div 
              onClick={(e) => { e.stopPropagation(); stopSession(); }}
              className="absolute -top-2 -right-2 bg-slate-800 text-slate-400 rounded-full p-1 hover:bg-red-500 hover:text-white transition-colors"
            >
              <X className="w-3 h-3" />
            </div>
          )}
        </button>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default VoiceAssistant;