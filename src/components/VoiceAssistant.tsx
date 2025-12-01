import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  FC,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Mic, MicOff, Loader2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Type,
} from '@google/genai';
import { ImageItem } from '../types';

/* -------------------------------------------------------------------------- */
/*                                TYPE DEFINITIONS                            */
/* -------------------------------------------------------------------------- */

export type ScrollDirection = 'UP' | 'DOWN' | 'TOP' | 'BOTTOM';

export type UiAction =
  | 'OPEN_COMPOSITE'
  | 'CLOSE_COMPOSITE'
  | 'OPEN_OCR'
  | 'OPEN_DOCS'
  | 'CHANGE_LANG'
  | 'OPEN_LANG_MENU'
  | 'CLOSE_ALL';

export type QueueAction = 'CLEAR_ALL' | 'DOWNLOAD_ZIP';

export type ItemAction =
  | 'REMOVE'
  | 'EDIT'
  | 'DOWNLOAD'
  | 'REMASTER'
  | 'CREATE_VARIANTS'
  | 'SHARE';

export type CompositeSelectionAction =
  | 'SELECT_ALL'
  | 'DESELECT_ALL'
  | 'TOGGLE_ITEM';

export interface ModalsState {
  composite: boolean;
  ocr: boolean;
  guide: boolean;
  langMenu?: boolean;
}

export interface CompositeUpdatePayload {
  prompt?: string;
  caption?: string;
  showCaption?: boolean;
  aspectRatio?: '1:1' | '16:9' | '9:16';
  resolution?: '1K' | '2K' | '4K';
  format?: 'JPG' | 'PNG' | 'WEBP';
}

export interface VoiceAssistantCommand {
  scrollAction?: ScrollDirection;

  updateNative?: boolean;
  triggerNative?: boolean;

  startQueue?: boolean;
  queueAction?: QueueAction;

  itemAction?: ItemAction;
  targetIndex?: string;

  uiAction?: UiAction;
  value?: string;

  compositeSelectionAction?: CompositeSelectionAction;

  // tetszőleges extra payload a fő app felé
  [key: string]: any;
}

export interface VoiceAssistantProps {
  apiKey: string;
  onCommand: (command: VoiceAssistantCommand) => void;
  onAudit: () => void;
  onApplyAll: () => void;
  onCompositeUpdate?: (updates: CompositeUpdatePayload) => void;
  currentLanguage: string;
  images?: ImageItem[];
  batchCompleteTrigger?: number;
  nativePrompt?: string;
  isNativeGenerating?: boolean;
  modalsState?: ModalsState;
}

/* -------------------------------------------------------------------------- */
/*                          AUDIO HELPER FUNKCIÓK                             */
/* -------------------------------------------------------------------------- */

// PCM 16-le → AudioBuffer (Gemini audio válaszok)
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = Math.floor(dataInt16.length / numChannels);
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      const index = i * numChannels + channel;
      const sample = dataInt16[index] ?? 0;
      channelData[i] = sample / 32768.0;
    }
  }

  return buffer;
}

// base64 → Uint8Array
function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Uint8Array → base64
function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Float32Array -> PCM int16 base64, dinamikus mintavételi frekvenciával
function createPcmBlob(
  data: Float32Array,
  sampleRate: number,
): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);

  for (let i = 0; i < l; i++) {
    // clamp – ne fussunk ki tartományból
    const v = Math.max(-1, Math.min(1, data[i]));
    int16[i] = v * 32767;
  }

  return {
    data: encodeBase64(new Uint8Array(int16.buffer)),
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
}

/* -------------------------------------------------------------------------- */
/*                              FŐ KOMPONENS                                  */
/* -------------------------------------------------------------------------- */

export const VoiceAssistant: FC<VoiceAssistantProps> = ({
  apiKey,
  onCommand,
  onAudit,
  onApplyAll,
  onCompositeUpdate,
  currentLanguage,
  images = [],
  batchCompleteTrigger = 0,
  nativePrompt = '',
  isNativeGenerating = false, // jelenleg nem használjuk, de jövőre jó
  modalsState = { composite: false, ocr: false, guide: false, langMenu: false },
}) => {
  const { t } = useTranslation();

  /* ------------------------------ UI STATE -------------------------------- */

  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [volume, setVolume] = useState(0);

  /* --------------------------- AUDIO / SESSION REFS ----------------------- */

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  /* ------------------------------------------------------------------------ */
  /*                           HELPER FUNKCIÓK                               */
  /* ------------------------------------------------------------------------ */

  const generateStateReport = useCallback((): string => {
    return `
[SYSTEM STATE SNAPSHOT]
- Current Interface Language: ${currentLanguage}
- Native Gen Input: "${nativePrompt || ''}"
- Modals Open:
    Composite=${modalsState.composite}
    OCR=${modalsState.ocr}
    Docs=${modalsState.guide}
    LangMenu=${modalsState.langMenu ?? false}
- Images in Queue: ${images.length}
`;
  }, [currentLanguage, nativePrompt, modalsState, images.length]);

  const getSystemInstruction = useCallback((): string => {
    const isHu = currentLanguage === 'hu';

    const context = modalsState.composite
      ? isHu
        ? "JELENLEG A 'COMPOSITE' (KÉPÖSSZEOLVASZTÓ) MÓDBAN VAGY. MINDEN KÉP PARANCS IDE VONATKOZIK."
        : "YOU ARE CURRENTLY IN 'COMPOSITE' MODE. ALL IMAGE COMMANDS APPLY HERE."
      : '';

    if (isHu) {
      return `
SZEREPLŐ: BananaAI Rendszergazda és Profi Prompt Mérnök (PhD szintű szleng ismerettel).
FELADAT: A felhasználói utasítások azonnali, kérdés nélküli végrehajtása.
${context}

SZLENG SZÓTÁR (GENERÁLÁS, MÓDOSÍTÁS, TÖRLÉS, BEZÁRÁS, CSEND stb.) – lásd: rendszer prompt.
(COMPOSITE mód, NYELVVÁLTÁS, KÉPGENERÁLÁS, DOKUMENTÁCIÓ OLVASÁS) – szigorú végrehajtás a megadott tool-okon keresztül.
`;
    }

    return `
ROLE: BananaAI System Admin & Expert Prompt Engineer (PhD-level).
TASK: Execute user commands IMMEDIATELY with ZERO hesitation.
${context}

Follow the tool contracts strictly. Use manage_ui_state, trigger_native_generation, manage_queue_actions, perform_item_action, etc. to fully control the in-page UI.
`;
  }, [currentLanguage, modalsState.composite]);

  const stopSession = useCallback(() => {
    sessionPromiseRef.current = null;

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // ignore
      }
    });
    sourcesRef.current.clear();

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close().catch(() => {});
      inputAudioContextRef.current = null;
    }

    nextStartTimeRef.current = 0;
    setVolume(0);
    setIsActive(false);
    setIsConnecting(false);
    setIsExecuting(false);
  }, []);

  // unmount cleanup
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, [stopSession]);

  /* ------------------------------------------------------------------------ */
  /*                       GEMINI TOOLING / HANDLERS                          */
  /* ------------------------------------------------------------------------ */

  const sendVisualContext = useCallback(
    async (session: any) => {
      if (!images || images.length === 0) return;

      const MAX_IMAGES = 3;
      const visualBatch = images.slice(0, MAX_IMAGES);

      for (const img of visualBatch) {
        try {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.src = img.previewUrl;

          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('Image load error'));
          });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          const MAX_SIZE = 1024;
          let { width, height } = image;

          if (width > height) {
            if (width > MAX_SIZE) {
              height = (height * MAX_SIZE) / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width = (width * MAX_SIZE) / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(image, 0, 0, width, height);

          const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

          await session.sendRealtimeInput([
            {
              media: {
                mimeType: 'image/jpeg',
                data: base64,
              },
            },
          ]);
        } catch (e) {
          console.error('Failed to send visual context frame', e);
        }
      }

      await session.sendToolResponse({
        functionResponses: [
          {
            name: 'request_visual_context',
            id: `visual-context-sent-${Date.now()}`,
            response: {
              result: `Visual context sent for ${visualBatch.length} images.`,
            },
          },
        ],
      });
    },
    [images],
  );

  /* ------------------------------------------------------------------------ */
  /*                       BATCH COMPLETE ANNOUNCEMENT                        */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (batchCompleteTrigger <= 0 || !sessionPromiseRef.current) return;

    sessionPromiseRef.current
      .then((session) =>
        session.sendToolResponse({
          functionResponses: [
            {
              name: 'system_announcement_trigger',
              id: `batch-complete-${Date.now()}`,
              response: {
                result:
                  currentLanguage === 'hu'
                    ? 'A kötegelt generálás befejeződött. Jelentsd be a felhasználónak.'
                    : 'Batch processing complete. Announce this to the user.',
              },
            },
          ],
        }),
      )
      .catch(() => {});
  }, [batchCompleteTrigger, currentLanguage]);

  /* ------------------------------------------------------------------------ */
  /*                        PROAKTÍV UI STATE UPDATE                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!isActive || !sessionPromiseRef.current) return;

    const getActiveModalLabel = (): string => {
      if (modalsState.composite) return 'Composite (Image Mixer) Modal';
      if (modalsState.ocr) return 'OCR (Text Extraction) Modal';
      if (modalsState.guide) return 'User Guide / Documentation';
      if (modalsState.langMenu) return 'Language Menu';
      return 'Main Dashboard';
    };

    const activeModal = getActiveModalLabel();

    sessionPromiseRef.current
      .then((session) =>
        session.sendRealtimeInput([
          {
            text: `[SYSTEM UPDATE: User switched view to: ${activeModal}]`,
          },
        ]),
      )
      .catch(() => {});
  }, [modalsState, isActive]);

  /* ------------------------------------------------------------------------ */
  /*                             SESSION START                                */
  /* ------------------------------------------------------------------------ */

  const startSession = useCallback(async () => {
    if (isActive || isConnecting) return;

    if (!apiKey) {
      console.error('No API key provided to VoiceAssistant');
      if (typeof window !== 'undefined') {
        alert(
          'Voice Assistant Error: No API key provided. Please check your configuration.',
        );
      }
      return;
    }

    setIsConnecting(true);

    try {
      const ai = new GoogleGenAI({ apiKey });

      const tools = [
        {
          functionDeclarations: [
            {
              name: 'get_system_state',
              description:
                'Returns the current UI state (images, modals, input text). Use this to "see" the screen.',
              parameters: { type: Type.OBJECT, properties: {} },
            },
            {
              name: 'scroll_viewport',
              description: 'Scrolls the page.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  direction: {
                    type: Type.STRING,
                    enum: ['UP', 'DOWN', 'TOP', 'BOTTOM'],
                  },
                },
              },
            },
            {
              name: 'update_native_input',
              description:
                'Types text into the native generator bar or changes its settings.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  prompt: { type: Type.STRING },
                  aspectRatio: {
                    type: Type.STRING,
                    enum: ['1:1', '16:9', '9:16'],
                  },
                  resolution: {
                    type: Type.STRING,
                    enum: ['1K', '2K', '4K'],
                  },
                  format: {
                    type: Type.STRING,
                    enum: ['JPG', 'PNG', 'WEBP'],
                  },
                },
              },
            },
            {
              name: 'manage_composite_settings',
              description:
                'Updates settings for the Composite (Image Mixer) mode.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  prompt: { type: Type.STRING },
                  caption: { type: Type.STRING },
                  showCaption: { type: Type.BOOLEAN },
                  aspectRatio: {
                    type: Type.STRING,
                    enum: ['1:1', '16:9', '9:16'],
                  },
                  resolution: {
                    type: Type.STRING,
                    enum: ['1K', '2K', '4K'],
                  },
                  format: {
                    type: Type.STRING,
                    enum: ['JPG', 'PNG', 'WEBP'],
                  },
                },
              },
            },
            {
              name: 'manage_composite_selection',
              description:
                'Selects/Deselects images in the Composite Modal.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    enum: ['SELECT_ALL', 'DESELECT_ALL', 'TOGGLE_ITEM'],
                  },
                  targetIndex: {
                    type: Type.STRING,
                    description: '1-based index for TOGGLE_ITEM',
                  },
                },
                required: ['action'],
              },
            },
            {
              name: 'trigger_native_generation',
              description:
                'Presses the generate button. Can optionally override prompt and settings immediately.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  prompt: {
                    type: Type.STRING,
                    description:
                      'The FULL, professionally enhanced prompt to generate.',
                  },
                  aspectRatio: { type: Type.STRING },
                  resolution: { type: Type.STRING },
                  format: { type: Type.STRING },
                },
              },
            },
            {
              name: 'perform_item_action',
              description:
                'Performs specific actions on single images in the queue.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    enum: [
                      'REMOVE',
                      'EDIT',
                      'DOWNLOAD',
                      'REMASTER',
                      'CREATE_VARIANTS',
                      'SHARE',
                    ],
                  },
                  targetIndex: {
                    type: Type.STRING,
                    description: '1-based index of the image.',
                  },
                },
                required: ['action', 'targetIndex'],
              },
            },
            {
              name: 'apply_settings_globally',
              description: 'Applies global settings to all images.',
              parameters: { type: Type.OBJECT, properties: {} },
            },
            {
              name: 'start_processing_queue',
              description: 'Starts processing all pending images.',
              parameters: { type: Type.OBJECT, properties: {} },
            },
            {
              name: 'analyze_images',
              description: 'Runs OCR analysis.',
              parameters: { type: Type.OBJECT, properties: {} },
            },
            {
              name: 'request_visual_context',
              description: 'Asks to SEE the images (pixels).',
              parameters: { type: Type.OBJECT, properties: {} },
            },
            {
              name: 'manage_ui_state',
              description:
                'Opens or closes modals, menus or CHANGES LANGUAGE.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    enum: [
                      'OPEN_COMPOSITE',
                      'CLOSE_COMPOSITE',
                      'OPEN_OCR',
                      'OPEN_DOCS',
                      'CHANGE_LANG',
                      'OPEN_LANG_MENU',
                      'CLOSE_ALL',
                    ],
                  },
                  value: {
                    type: Type.STRING,
                    description:
                      "For CHANGE_LANG, pass the ISO code (e.g. 'hu', 'en').",
                  },
                },
              },
            },
            {
              name: 'manage_queue_actions',
              description: 'Global queue actions (Clear All, Download All).',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    enum: ['CLEAR_ALL', 'DOWNLOAD_ZIP'],
                  },
                },
              },
            },
            {
              name: 'read_documentation',
              description: 'Reads the full system documentation/user guide.',
              parameters: { type: Type.OBJECT, properties: {} },
            },
            {
              name: 'playback_control',
              description:
                'Controls the reading of documentation (Pause, Resume, Stop).',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    enum: ['PAUSE', 'RESUME', 'STOP'],
                  },
                },
              },
            },
            {
              name: 'close_assistant',
              description: 'Closes the voice assistant (stops listening).',
              parameters: { type: Type.OBJECT, properties: {} },
            },
          ],
        },
      ];

      // AudioContext kompatibilitás
      const AudioContextCtor =
        (window as any).AudioContext ||
        (window as any).webkitAudioContext;

      const inputAudioContext = new AudioContextCtor();
      inputAudioContextRef.current = inputAudioContext;

      const outputSampleRate = 24000;
      const audioContext = new AudioContextCtor({ sampleRate: outputSampleRate });
      audioContextRef.current = audioContext;

      const outputGain = audioContext.createGain();
      outputGain.connect(audioContext.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // hangerő vizualizáció
      const analyser = inputAudioContext.createAnalyser();
      const visualizerSource = inputAudioContext.createMediaStreamSource(stream);
      visualizerSource.connect(analyser);

      const updateVolume = () => {
        if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') return;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const avg =
          dataArray.length === 0
            ? 0
            : dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setVolume(avg);
        requestAnimationFrame(updateVolume);
      };
      updateVolume();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          tools,
          systemInstruction: getSystemInstruction(),
          responseModalities: [Modality.AUDIO],
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);

            // kezdő system state report
            sessionPromise
              .then((s) =>
                s.sendToolResponse({
                  functionResponses: [
                    {
                      name: 'system_state_report',
                      id: `init-state-${Date.now()}`,
                      response: { result: generateStateReport() },
                    },
                  ],
                }),
              )
              .catch(() => {});

            // mikrofonnal való input streamelése
            const source =
              inputAudioContext.createMediaStreamSource(stream);
            sourceRef.current = source;

            const scriptProcessor =
              inputAudioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (event) => {
              const inputData =
                event.inputBuffer.getChannelData(0) ?? new Float32Array(0);
              if (!sessionPromiseRef.current) return;

              const pcmBlob = createPcmBlob(
                inputData,
                inputAudioContext.sampleRate,
              );

              sessionPromiseRef.current
                .then((session) =>
                  session.sendRealtimeInput([
                    {
                      media: pcmBlob,
                    },
                  ]),
                )
                .catch(() => {});
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);

            sessionPromiseRef.current = sessionPromise;
          },

          onmessage: async (message: LiveServerMessage) => {
            // TOOL CALL HANDLING
            if (message.toolCall) {
              setIsExecuting(true);

              const functionResponses: Array<{
                id: string;
                name: string;
                response: { result: any };
              }> = [];

              for (const fc of message.toolCall.functionCalls) {
                const args: any = fc.args ?? {};
                let result: any = { ok: true };

                try {
                  switch (fc.name) {
                    case 'get_system_state': {
                      result = {
                        ok: true,
                        message: generateStateReport(),
                      };
                      break;
                    }

                    case 'scroll_viewport': {
                      onCommand({ scrollAction: args.direction });
                      result = {
                        ok: true,
                        message: `Scrolled ${args.direction}`,
                      };
                      break;
                    }

                    case 'update_native_input': {
                      onCommand({ updateNative: true, ...args });
                      result = {
                        ok: true,
                        message: 'Native input updated.',
                      };
                      break;
                    }

                    case 'trigger_native_generation': {
                      onCommand({
                        triggerNative: true,
                        prompt: args.prompt,
                        aspectRatio: args.aspectRatio,
                        resolution: args.resolution,
                        format: args.format,
                      });
                      result = {
                        ok: true,
                        message: 'Generation started successfully.',
                      };
                      break;
                    }

                    case 'perform_item_action': {
                      onCommand({
                        itemAction: args.action,
                        targetIndex: args.targetIndex,
                      });
                      result = {
                        ok: true,
                        message: `Action ${args.action} performed on item ${args.targetIndex}.`,
                      };
                      break;
                    }

                    case 'apply_settings_globally': {
                      onApplyAll();
                      result = {
                        ok: true,
                        message: 'Applied globally.',
                      };
                      break;
                    }

                    case 'start_processing_queue': {
                      onCommand({ startQueue: true });
                      result = {
                        ok: true,
                        message: 'Queue started.',
                      };
                      break;
                    }

                    case 'analyze_images': {
                      onAudit();
                      result = {
                        ok: true,
                        message: 'Audit running.',
                      };
                      break;
                    }

                    case 'request_visual_context': {
                      if (sessionPromiseRef.current) {
                        sessionPromiseRef.current
                          .then((s) => sendVisualContext(s))
                          .catch(() => {});
                      }
                      // ezt külön küldjük, itt nincs azonnali result
                      continue;
                    }

                    case 'manage_ui_state': {
                      onCommand({
                        uiAction: args.action as UiAction,
                        value: args.value,
                      });
                      result = {
                        ok: true,
                        message: `UI State updated: ${args.action} -> ${args.value}`,
                      };
                      break;
                    }

                    case 'manage_queue_actions': {
                      onCommand({
                        queueAction: args.action as QueueAction,
                      });
                      result = {
                        ok: true,
                        message: 'Queue action executed.',
                      };
                      break;
                    }

                    case 'manage_composite_settings': {
                      if (onCompositeUpdate) {
                        onCompositeUpdate(args as CompositeUpdatePayload);
                        result = {
                          ok: true,
                          message: 'Composite settings updated.',
                        };
                      } else {
                        result = {
                          ok: false,
                          message:
                            'Composite mode not active or handler missing.',
                        };
                      }
                      break;
                    }

                    case 'manage_composite_selection': {
                      onCommand({
                        compositeSelectionAction:
                          args.action as CompositeSelectionAction,
                        targetIndex: args.targetIndex,
                      });
                      result = {
                        ok: true,
                        message: `Selection updated: ${args.action}`,
                      };
                      break;
                    }

                    case 'read_documentation': {
                      const docs = `
${t('guideTitle')}

${t('guideSection1Title')}
${t('guideSection1Text')}
- ${t('guideSection1List1')}
- ${t('guideSection1List2')}
- ${t('guideSection1List3')}

${t('guideSection2Title')}
${t('guideSection2Text1')}
${t('guideSection2Text2')}

${t('guideSection3Title')}
${t('guideSection3Text')}

${t('guideSection4Title')}
${t('guideSection4AspectRatio')}: ${t('guideSection4AspectRatioText')}
${t('guideSection4Resolution')}: ${t('guideSection4ResolutionText')}

${t('guideSection5Title')}
${t('guideSection5Text')}
`.trim();

                      if (!modalsState.guide) {
                        onCommand({ uiAction: 'OPEN_DOCS' });
                      }

                      result = {
                        ok: true,
                        message: `Here is the documentation content. PLEASE READ THIS ALOUD TO THE USER NATURALLY:\n\n${docs}`,
                      };
                      break;
                    }

                    case 'playback_control': {
                      const action = args.action as
                        | 'PAUSE'
                        | 'RESUME'
                        | 'STOP';

                      if (action === 'PAUSE') {
                        if (
                          audioContextRef.current &&
                          audioContextRef.current.state === 'running'
                        ) {
                          await audioContextRef.current.suspend();
                        }
                        result = { ok: true, message: 'Paused.' };
                      } else if (action === 'RESUME') {
                        if (
                          audioContextRef.current &&
                          audioContextRef.current.state === 'suspended'
                        ) {
                          await audioContextRef.current.resume();
                          nextStartTimeRef.current =
                            audioContextRef.current.currentTime;
                        }
                        result = { ok: true, message: 'Resumed.' };
                      } else if (action === 'STOP') {
                        sourcesRef.current.forEach((source) => {
                          try {
                            source.stop();
                          } catch {
                            // ignore
                          }
                        });
                        sourcesRef.current.clear();

                        if (audioContextRef.current) {
                          nextStartTimeRef.current =
                            audioContextRef.current.currentTime;
                        }

                        if (sessionPromiseRef.current) {
                          sessionPromiseRef.current
                            .then((s) =>
                              s.sendRealtimeInput([
                                {
                                  text: '[SYSTEM: User interrupted. STOP speaking immediately.]',
                                },
                              ]),
                            )
                            .catch(() => {});
                        }

                        result = { ok: true, message: 'Stopped.' };
                      } else {
                        result = { ok: false, message: 'Invalid action.' };
                      }
                      break;
                    }

                    case 'close_assistant': {
                      stopSession();
                      result = { ok: true, message: 'Assistant closed.' };
                      break;
                    }

                    default: {
                      result = {
                        ok: false,
                        message: `Unknown tool: ${fc.name}`,
                      };
                      break;
                    }
                  }
                } catch (err: any) {
                  console.error('Tool execution error', err);
                  result = {
                    ok: false,
                    message: err?.message ?? 'Tool execution error',
                  };
                }

                functionResponses.push({
                  id: fc.id,
                  name: fc.name,
                  response: { result },
                });
              }

              if (functionResponses.length > 0 && sessionPromiseRef.current) {
                sessionPromiseRef.current
                  .then((s) => s.sendToolResponse({ functionResponses }))
                  .catch(() => {});
              }

              setTimeout(() => setIsExecuting(false), 400);
            }

            // AUDIO VÁLASZ LEJÁTSZÁS
            const base64Audio =
              message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;

            if (base64Audio && audioContextRef.current) {
              try {
                const audioContext = audioContextRef.current;
                nextStartTimeRef.current = Math.max(
                  nextStartTimeRef.current,
                  audioContext.currentTime,
                );

                const audioBuffer = await decodeAudioData(
                  decodeBase64(base64Audio),
                  audioContext,
                  outputSampleRate,
                  1,
                );

                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputGain);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;

                sourcesRef.current.add(source);
                source.onended = () => {
                  sourcesRef.current.delete(source);
                };
              } catch (err) {
                console.error('Error playing TTS audio', err);
              }
            }
          },

          onclose: () => {
            stopSession();
          },

          onerror: (err: any) => {
            console.error('Voice assistant error', err);
            if (typeof window !== 'undefined') {
              alert('Voice Assistant Error: ' + (err?.message ?? String(err)));
            }
            stopSession();
          },
        },
      });

      sessionPromiseRef.current = sessionPromise;
    } catch (e: any) {
      console.error(e);
      setIsConnecting(false);
      if (typeof window !== 'undefined') {
        alert('Voice Assistant Error: ' + (e?.message ?? String(e)));
      }
      stopSession();
    }
  }, [
    apiKey,
    generateStateReport,
    getSystemInstruction,
    onCommand,
    onApplyAll,
    onAudit,
    onCompositeUpdate,
    sendVisualContext,
    stopSession,
    isActive,
    isConnecting,
    modalsState.guide,
    t,
  ]);

  /* ------------------------------------------------------------------------ */
  /*                             RENDER (PORTAL)                              */
  /* ------------------------------------------------------------------------ */

  if (typeof document === 'undefined') {
    // SSR védelem
    return null;
  }

  return createPortal(
    <motion.div
      drag
      dragMomentum={false}
      whileDrag={{ scale: 1.1 }}
      className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2 cursor-pointer touch-none"
    >
      {isActive && (
        <div className="flex flex-col gap-2 items-end">
          {isExecuting && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-purple-900/80 backdrop-blur-md border border-purple-500/30 text-purple-200 text-xs px-3 py-1.5 rounded-full shadow-xl flex items-center gap-2"
            >
              <Sparkles className="w-3 h-3 text-purple-400 animate-spin" />
              Processing command...
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 text-emerald-400 text-xs px-3 py-1.5 rounded-full shadow-xl flex items-center gap-2"
          >
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Connected ({Math.round(volume)}%)
          </motion.div>
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isActive) {
            stopSession();
          } else {
            startSession();
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`
          relative w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all
          ${
            isActive
              ? 'bg-red-500 hover:bg-red-600'
              : isConnecting
              ? 'bg-slate-700'
              : 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:scale-110'
          }
        `}
      >
        {isActive && (
          <div
            className="absolute inset-0 rounded-full border-2 border-white/30 transition-transform"
            style={{ transform: `scale(${1 + volume / 100})` }}
          />
        )}

        {!isActive && !isConnecting && (
          <div className="absolute inset-0 rounded-full bg-emerald-500/30 voice-pulse -z-10" />
        )}

        {isConnecting ? (
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        ) : isActive ? (
          <Mic className="w-8 h-8 text-white" />
        ) : (
          <MicOff className="w-8 h-8 text-white/80" />
        )}
      </button>
    </motion.div>,
    document.body,
  );
};
