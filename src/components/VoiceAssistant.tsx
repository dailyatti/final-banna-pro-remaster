import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { Mic, MicOff, Loader2, Sparkles, ChevronUp, ChevronDown, Eye, EyeOff, Power } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { ImageItem } from '../types';
import { resources } from '../services/i18n';
import { POD_PRESETS } from '../data/podPresets';

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
    modalsState?: { composite: boolean; ocr: boolean; guide: boolean; langMenu?: boolean };
}

// Audio Decoding for Gemini Live (PCM 16le -> AudioBuffer)
async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

// Helper to decode base64
function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Helper to encode base64
function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Create PCM Blob for sending to API with DYNAMIC Sample Rate
function createBlob(data: Float32Array, sampleRate: number): { data: string; mimeType: string } {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: `audio/pcm;rate=${sampleRate}`,
    };
}

// DOM Element detection and analysis
interface ViewportElement {
    type: 'image' | 'button' | 'input' | 'modal' | 'section' | 'card';
    id?: string;
    index?: number;
    text?: string;
    visible: boolean;
    rect: DOMRect;
    attributes?: Record<string, string>;
}

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
    isNativeGenerating = false,
    modalsState = { composite: false, ocr: false, guide: false, langMenu: false }
}) => {
    const [isActive, setIsActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [volume, setVolume] = useState(0);
    const [scrollPosition, setScrollPosition] = useState({ top: 0, percent: 0 });
    const [viewportElements, setViewportElements] = useState<ViewportElement[]>([]);
    const [showVisualAssist, setShowVisualAssist] = useState(false);
    const [confirmingShutdown, setConfirmingShutdown] = useState(false);

    // Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const sessionRef = useRef<any>(null);

    // Callback refs to avoid stale closures
    const onCommandRef = useRef(onCommand);
    const onAuditRef = useRef(onAudit);
    const onApplyAllRef = useRef(onApplyAll);
    const onCompositeUpdateRef = useRef(onCompositeUpdate);

    useEffect(() => {
        onCommandRef.current = onCommand;
        onAuditRef.current = onAudit;
        onApplyAllRef.current = onApplyAll;
        onCompositeUpdateRef.current = onCompositeUpdate;
    }, [onCommand, onAudit, onApplyAll, onCompositeUpdate]);

    // Enhanced Scroll Position Tracking
    useEffect(() => {
        const handleScroll = () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
            const percent = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;

            setScrollPosition({ top: scrollTop, percent });

            // Analyze viewport elements on scroll
            if (isActive) {
                analyzeViewport();
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll(); // Initial call

        return () => window.removeEventListener('scroll', handleScroll);
    }, [isActive]);

    // Analyze viewport elements for context awareness
    const analyzeViewport = useCallback(() => {
        const elements: ViewportElement[] = [];
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        // Detect images in the queue
        document.querySelectorAll('[data-image-index]').forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            if (rect.top < viewportHeight && rect.bottom > 0) {
                elements.push({
                    type: 'image',
                    id: el.getAttribute('data-image-id') || undefined,
                    index: parseInt(el.getAttribute('data-image-index') || '0'),
                    visible: true,
                    rect,
                    attributes: {
                        'data-index': el.getAttribute('data-image-index'),
                        'data-status': el.getAttribute('data-status') || 'unknown'
                    }
                });
            }
        });

        // Detect buttons
        document.querySelectorAll('button, [role="button"]').forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            if (rect.top < viewportHeight && rect.bottom > 0) {
                elements.push({
                    type: 'button',
                    id: el.id || undefined,
                    text: el.textContent?.substring(0, 50) || undefined,
                    visible: true,
                    rect,
                    attributes: {
                        'aria-label': el.getAttribute('aria-label') || undefined,
                        'data-testid': el.getAttribute('data-testid') || undefined
                    }
                });
            }
        });

        // Detect inputs and textareas
        document.querySelectorAll('input, textarea, [contenteditable="true"]').forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.top < viewportHeight && rect.bottom > 0) {
                elements.push({
                    type: 'input',
                    id: el.id || undefined,
                    visible: true,
                    rect,
                    attributes: {
                        'placeholder': el.getAttribute('placeholder') || undefined,
                        'value': (el as HTMLInputElement).value?.substring(0, 100) || undefined,
                        'type': el.getAttribute('type') || 'text'
                    }
                });
            }
        });

        // Detect modals
        document.querySelectorAll('[role="dialog"], .modal, [data-modal]').forEach((el) => {
            const rect = el.getBoundingClientRect();
            elements.push({
                type: 'modal',
                id: el.id || undefined,
                visible: rect.width > 0 && rect.height > 0,
                rect,
                attributes: {
                    'aria-label': el.getAttribute('aria-label') || undefined,
                    'data-modal-type': el.getAttribute('data-modal-type') || 'unknown'
                }
            });
        });

        setViewportElements(elements);
    }, []);

    // Enhanced State Reporting
    const generateStateReport = useCallback(() => {
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        const viewportSummary = viewportElements.reduce((acc, el) => {
            acc[el.type] = (acc[el.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return `
[SYSTEM STATE SNAPSHOT - ${new Date().toISOString()}]

1. INTERFACE STATE:
   - Language: ${currentLanguage} (${resources[currentLanguage]?.translation?.language_name || 'unknown'})
   - Scroll Position: ${scrollPosition.top}px (${scrollPosition.percent}% of page)
   - Viewport Contains: ${JSON.stringify(viewportSummary)}

2. MODAL STATES:
   - Composite Modal: ${modalsState.composite ? 'OPEN' : 'closed'}
   - OCR Modal: ${modalsState.ocr ? 'OPEN' : 'closed'}
   - Documentation: ${modalsState.guide ? 'OPEN' : 'closed'}
   - Language Menu: ${modalsState.langMenu ? 'OPEN' : 'closed'}

3. GENERATION STATE:
   - Native Input: "${nativePrompt.substring(0, 100)}${nativePrompt.length > 100 ? '...' : ''}"
   - Is Generating: ${isNativeGenerating ? 'YES' : 'NO'}
   - Images in Queue: ${images.length}
   - Last Batch Trigger: ${batchCompleteTrigger}

4. VIEWPORT ELEMENTS (${viewportElements.length} items):
   ${viewportElements.slice(0, 10).map(el =>
            `   - ${el.type}${el.index !== undefined ? ` #${el.index}` : ''}${el.text ? `: "${el.text.substring(0, 30)}"` : ''}`
        ).join('\n')}
   ${viewportElements.length > 10 ? `   ... and ${viewportElements.length - 10} more` : ''}

5. INTERACTIVE CONTROLS:
   - Visual Assist: ${showVisualAssist ? 'ACTIVE' : 'inactive'}

[END OF STATE REPORT]
        `.trim();
    }, [currentLanguage, scrollPosition, viewportElements, modalsState, nativePrompt, isNativeGenerating, images.length, batchCompleteTrigger, showVisualAssist]);

    // Enhanced System Instruction with PhD-level context awareness
    const getSystemInstruction = useCallback(() => {
        const isHu = currentLanguage === 'hu';

        const baseInstruction = `
You are the Voice Interface of BananaAI. You have COMPLETE control over the interface.

YOUR CAPABILITIES:
1. SCREEN AWARENESS: You know exactly what's visible on screen (images, buttons, inputs, modals)
2. PRECISE NAVIGATION: You scroll in STEPS (half screen or quarter screen), never continuously.
3. MODAL MASTERY: You can open/close ANY modal window and interact with its contents
4. ELEMENT CONTROL: You can click any button, fill any input, and modify any visible element
5. CONTEXT SWITCHING: You maintain awareness of which context you're in (main page vs modal)

SCROLLING PROTOCOL:
- "Scroll down" -> control_scroll(direction="DOWN", intensity="NORMAL") (approx 50% screen)
- "Scroll a little down" -> control_scroll(direction="DOWN", intensity="SMALL") (approx 25% screen)
- "Scroll up" -> control_scroll(direction="UP", intensity="NORMAL")
- "Scroll to image 5" -> navigate_to_position(position="image 5")
- NEVER use continuous scrolling. Always discrete steps.

MODAL MANAGEMENT:
- To open a modal: Use manage_ui_state with appropriate OPEN_ action
- To close a modal: Use manage_ui_state with CLOSE_ action
- When in a modal: All commands apply ONLY to that modal's context
- Before acting: Check if relevant element is visible in viewport

ELEMENT INTERACTION:
- Use perform_element_action to interact with visible elements
- Provide element_index from viewport analysis or describe element clearly
- For inputs: Use update_element_value to modify content
- For buttons: Use perform_element_action with 'CLICK'

SHUTDOWN PROTOCOL:
- If user says "Stop", "Exit", "Close yourself":
  1. Ask "Do you want to close me?" (or Hungarian equivalent)
  2. If user says "Yes": Call disconnect_assistant()
  3. If user says "No": Continue listening.

CONTEXT PRESERVATION:
- Always check scroll position and viewport contents before acting
- If element isn't visible, scroll to make it visible first
- Maintain focus: Don't switch contexts unless explicitly requested
- Report changes: Always describe what you did and what changed

SPECIAL COMMANDS:
- "Show me what you see": Activates visual assist mode
- "Where am I?": Reports detailed position and visible elements
- "Take me to [section]": Navigates to named section
- "Modify the third image": Uses index-based targeting
        `;

        const languageSpecific = isHu ? `
MAGYAR NYELVŰ KONTEKSTUS:

GÖRGETÉS PARANCSOK:
- "Görgess le": control_scroll DOWN NORMAL
- "Görgess lejjebb egy kicsit": control_scroll DOWN SMALL
- "Görgess fel": control_scroll UP NORMAL
- "Ugorj az aljára": navigate_to_position 100%
- "Menj a tetejére": navigate_to_position 0%
- "Görgess a 3-as képhez": navigate_to_position "image 3"

MODAL KEZELÉS:
- "Nyisd meg a kompozit ablakot": manage_ui_state OPEN_COMPOSITE
- "Zárd be az OCR-t": manage_ui_state CLOSE_OCR
- "Mutasd a dokumentációt": manage_ui_state OPEN_DOCS

ELEM INTERAKCIÓ:
- "Kattints a második képre": perform_element_action CLICK 2 (image)
- "Írd be ide: 'macska'": update_element_value [input_index] "macska"
- "Nyomd meg a generálás gombot": perform_element_action CLICK [generate_button_index]

LEÁLLÍTÁS:
- "Állj", "Lépj ki": Kérdezd meg: "Bezárjam magam?" -> Ha "Igen": disconnect_assistant()

KONTEXTUS ÉRZÉKELÉS:
- Mindig ellenőrizd: melyik ablak aktív, mi látható
- Ha nem látszik az elem: görgess oda
- Jelentkezz: "Most a képsorozat generáló ablakban vagyok"
        ` : `
ENGLISH CONTEXT:

SCROLLING COMMANDS:
- "Scroll down": control_scroll DOWN NORMAL
- "Scroll a bit down": control_scroll DOWN SMALL
- "Scroll up": control_scroll UP NORMAL
- "Jump to bottom": navigate_to_position 100%
- "Go to top": navigate_to_position 0%
- "Scroll to image 3": navigate_to_position "image 3"

MODAL MANAGEMENT:
- "Open composite modal": manage_ui_state OPEN_COMPOSITE
- "Close OCR window": manage_ui_state CLOSE_OCR
- "Show documentation": manage_ui_state OPEN_DOCS

ELEMENT INTERACTION:
- "Click the second image": perform_element_action CLICK 2 (image)
- "Type 'cat' here": update_element_value [input_index] "cat"
- "Press generate button": perform_element_action CLICK [generate_button_index]

SHUTDOWN:
- "Stop", "Exit": Ask "Do you want to close me?" -> If "Yes": disconnect_assistant()

CONTEXT AWARENESS:
- Always check: which window is active, what's visible
- If element not visible: scroll to it first
- Report: "I'm now in the batch generation modal"
        `;

        return baseInstruction + languageSpecific + generateStateReport();
    }, [currentLanguage, generateStateReport]);

    // Enhanced Tool: Navigate to specific position
    const navigateToPosition = useCallback((position: string) => {
        let targetY = 0;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;

        if (position.endsWith('%')) {
            const percent = parseInt(position);
            targetY = (percent / 100) * docHeight;
        } else if (position.endsWith('px')) {
            targetY = parseInt(position);
        } else if (position === 'top') {
            targetY = 0;
        } else if (position === 'bottom') {
            targetY = docHeight;
        } else if (position.toLowerCase().includes('image')) {
            // Handle "image 3" or "3. image"
            const match = position.match(/\d+/);
            if (match) {
                const index = parseInt(match[0]);
                // Try to find by data-image-index (1-based usually in UI, check logic)
                // Assuming data-image-index is 1-based from MainApp
                const el = document.querySelector(`[data-image-index="${index}"]`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return { ok: true, message: `Navigated to image ${index}` };
                }
                return { ok: false, message: `Image ${index} not found on screen` };
            }
        } else {
            // Try to find element by selector or text
            const element = document.querySelector(position) ||
                Array.from(document.querySelectorAll('*')).find(el =>
                    el.textContent?.toLowerCase().includes(position.toLowerCase())
                );
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return { ok: true, message: `Navigated to element: ${position}` };
            }
            return { ok: false, message: `Could not find element: ${position}` };
        }

        window.scrollTo({ top: targetY, behavior: 'smooth' });
        return { ok: true, message: `Navigated to position: ${position}` };
    }, []);

    // Enhanced Tool: Interact with specific elements
    const interactWithElement = useCallback((action: string, elementIndex?: number, selector?: string, value?: string) => {
        let element: Element | null = null;

        if (elementIndex !== undefined && viewportElements[elementIndex]) {
            const elInfo = viewportElements[elementIndex];
            // Find element by matching position (simplified - in real implementation would use more precise matching)
            element = document.elementFromPoint(
                elInfo.rect.left + elInfo.rect.width / 2,
                elInfo.rect.top + elInfo.rect.height / 2
            );
        } else if (selector) {
            element = document.querySelector(selector);
        }

        if (!element) {
            return { ok: false, message: 'Element not found' };
        }

        switch (action) {
            case 'CLICK':
                (element as HTMLElement).click();
                return { ok: true, message: `Clicked element: ${selector || `index ${elementIndex}`}` };

            case 'FOCUS':
                (element as HTMLElement).focus();
                return { ok: true, message: `Focused element: ${selector || `index ${elementIndex}`}` };

            case 'UPDATE_VALUE':
                if (value !== undefined) {
                    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                        element.value = value;
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (element.hasAttribute('contenteditable')) {
                        element.textContent = value;
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    return { ok: true, message: `Updated value to: ${value}` };
                }
                return { ok: false, message: 'No value provided' };

            default:
                return { ok: false, message: `Unknown action: ${action}` };
        }
    }, [viewportElements]);

    // Start Session with enhanced capabilities
    const startSession = async () => {
        if (isActive) return;
        if (!apiKey) {
            toast.error("API Key is required for Voice Assistant");
            return;
        }

        setIsConnecting(true);

        try {
            const ai = new GoogleGenAI({ apiKey });

            const tools = [{
                functionDeclarations: [
                    {
                        name: 'get_system_state',
                        description: 'Returns comprehensive UI state including scroll position, viewport elements, and modal states.',
                        parameters: { type: Type.OBJECT, properties: {} }
                    },
                    {
                        name: 'control_scroll',
                        description: 'Controls page scrolling in discrete steps.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                direction: { type: Type.STRING, enum: ['UP', 'DOWN'], description: 'Direction to scroll.' },
                                intensity: { type: Type.STRING, enum: ['NORMAL', 'SMALL', 'LARGE'], description: 'NORMAL=50% screen, SMALL=25%, LARGE=100%' }
                            },
                            required: ['direction']
                        }
                    },
                    {
                        name: 'navigate_to_position',
                        description: 'Jump to specific position or element (e.g. "image 3").',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                position: { type: Type.STRING, description: 'e.g., "500px", "50%", "top", "bottom", "image 3", "#element-id"' }
                            },
                            required: ['position']
                        }
                    },
                    {
                        name: 'analyze_viewport',
                        description: 'Detailed analysis of currently visible elements in viewport.',
                        parameters: { type: Type.OBJECT, properties: {} }
                    },
                    {
                        name: 'perform_element_action',
                        description: 'Interact with specific visible element by index or selector.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                action: { type: Type.STRING, enum: ['CLICK', 'FOCUS', 'UPDATE_VALUE', 'SCROLL_TO'] },
                                element_index: { type: Type.NUMBER, description: 'Index from viewport analysis (0-based)' },
                                selector: { type: Type.STRING, description: 'CSS selector for the element' },
                                value: { type: Type.STRING, description: 'For UPDATE_VALUE action' }
                            },
                            required: ['action']
                        }
                    },
                    {
                        name: 'toggle_visual_assist',
                        description: 'Toggle visual overlay showing what the assistant can see.',
                        parameters: { type: Type.OBJECT, properties: {} }
                    },
                    {
                        name: 'disconnect_assistant',
                        description: 'Closes the voice assistant session.',
                        parameters: { type: Type.OBJECT, properties: {} }
                    },
                    {
                        name: 'update_dashboard',
                        description: 'Updates existing images config in the queue (bulk or specific).',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                aspectRatio: { type: Type.STRING, enum: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
                                resolution: { type: Type.STRING, enum: ['1K', '2K', '4K'] },
                                format: { type: Type.STRING, enum: ['JPG', 'PNG', 'WEBP'] },
                                namingPattern: { type: Type.STRING, enum: ['ORIGINAL', 'RANDOM', 'SEQUENTIAL'] },
                                prompt: { type: Type.STRING },
                                targetIndex: { type: Type.STRING }
                            }
                        }
                    },
                    {
                        name: 'update_composite_settings',
                        description: 'Updates settings specifically for the Composite Generation Modal when it is open.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                aspectRatio: { type: Type.STRING, enum: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
                                resolution: { type: Type.STRING, enum: ['1K', '2K', '4K'] },
                                format: { type: Type.STRING, enum: ['JPG', 'PNG', 'WEBP'] },
                                prompt: { type: Type.STRING }
                            }
                        }
                    },
                    {
                        name: 'update_native_input',
                        description: 'Types text into the native generator bar or changes its settings.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                prompt: { type: Type.STRING },
                                aspectRatio: { type: Type.STRING, enum: ['1:1', '16:9', '9:16'] },
                                resolution: { type: Type.STRING, enum: ['1K', '2K', '4K'] },
                                format: { type: Type.STRING, enum: ['JPG', 'PNG', 'WEBP'] }
                            }
                        }
                    },
                    {
                        name: 'trigger_native_generation',
                        description: 'PRESSES THE GENERATE BUTTON. Can optionally override prompt and settings immediately.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                prompt: { type: Type.STRING, description: "The FULL, professionally enhanced prompt to generate." },
                                aspectRatio: { type: Type.STRING },
                                resolution: { type: Type.STRING },
                                format: { type: Type.STRING }
                            }
                        }
                    },
                    {
                        name: 'perform_item_action',
                        description: 'Performs specific actions on single images in the queue.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                action: { type: Type.STRING, enum: ['REMOVE', 'EDIT', 'DOWNLOAD', 'REMASTER', 'CREATE_VARIANTS', 'SHARE'] },
                                targetIndex: { type: Type.STRING, description: "1-based index of the image." }
                            },
                            required: ['action', 'targetIndex']
                        }
                    },
                    {
                        name: 'apply_settings_globally',
                        description: 'Applies global settings to all images.',
                        parameters: { type: Type.OBJECT, properties: {} }
                    },
                    {
                        name: 'start_processing_queue',
                        description: 'Starts processing all pending images.',
                        parameters: { type: Type.OBJECT, properties: {} }
                    },
                    {
                        name: 'analyze_images',
                        description: 'Runs OCR analysis.',
                        parameters: { type: Type.OBJECT, properties: {} }
                    },
                    {
                        name: 'manage_ui_state',
                        description: 'Opens modals, menus or CHANGES LANGUAGE.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                action: { type: Type.STRING, enum: ['OPEN_COMPOSITE', 'OPEN_OCR', 'OPEN_DOCS', 'CHANGE_LANG', 'OPEN_LANG_MENU', 'CLOSE_COMPOSITE', 'CLOSE_OCR', 'CLOSE_DOCS', 'CLOSE_ALL'] },
                                value: { type: Type.STRING, description: "For CHANGE_LANG, pass the ISO code (e.g. 'hu', 'en')." }
                            }
                        }
                    },
                    {
                        name: 'manage_queue_actions',
                        description: 'Global queue actions (Clear All, Download All).',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                action: { type: Type.STRING, enum: ['CLEAR_ALL', 'DOWNLOAD_ZIP'] }
                            }
                        }
                    },
                    {
                        name: 'read_documentation',
                        description: 'Returns the full system documentation text for the current language.',
                        parameters: { type: Type.OBJECT, properties: {} }
                    },
                    {
                        name: 'control_pod_module',
                        description: 'Controls the Print-on-Demand (POD) module.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                action: { type: Type.STRING, enum: ['OPEN', 'CLOSE', 'SELECT_CATEGORY', 'APPLY_PRESET'] },
                                category: { type: Type.STRING, enum: Object.keys(POD_PRESETS) },
                                presetId: { type: Type.STRING, description: "The ID of the preset prompt to apply." }
                            },
                            required: ['action']
                        }
                    }
                ]
            }];

            // Audio context setup (same as original)
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContextRef.current = audioContext;
            const outputNode = audioContext.createGain();
            outputNode.connect(audioContext.destination);

            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                console.error("Microphone access denied:", err);
                toast.error("Microphone access denied. Please check your browser settings.");
                setIsConnecting(false);
                return;
            }
            streamRef.current = stream;

            const streamSettings = stream.getAudioTracks()[0].getSettings();
            const streamSampleRate = streamSettings.sampleRate || 48000;

            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: streamSampleRate });
            inputAudioContextRef.current = inputAudioContext;

            const analyzer = inputAudioContext.createAnalyser();
            const visualizerSource = inputAudioContext.createMediaStreamSource(stream);
            visualizerSource.connect(analyzer);

            const updateVolume = () => {
                if (inputAudioContext.state === 'closed') return;
                const dataArray = new Uint8Array(analyzer.frequencyBinCount);
                analyzer.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
                setVolume(avg);
                requestAnimationFrame(updateVolume);
            };
            updateVolume();

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    tools: tools,
                    systemInstruction: getSystemInstruction(),
                    responseModalities: [Modality.AUDIO],
                },
                callbacks: {
                    onopen: () => {
                        setIsActive(true);
                        setIsConnecting(false);

                        // Send initial comprehensive state
                        sessionPromise.then(s => {
                            s.sendToolResponse({
                                functionResponses: {
                                    name: 'system_state_report',
                                    id: 'init-state-' + Date.now(),
                                    response: { result: generateStateReport() }
                                }
                            });
                        }).catch(() => { });

                        // Audio processing (same as original)
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        sourceRef.current = source;
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        processorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData, inputAudioContext.sampleRate);
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };

                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                        sessionRef.current = sessionPromise;
                    },

                    onmessage: async (message: LiveServerMessage) => {
                        if (message.toolCall) {
                            setIsExecuting(true);
                            const functionResponses = [];

                            for (const fc of message.toolCall.functionCalls) {
                                const args = fc.args as any;
                                let result: { ok: boolean; message?: string } = { ok: true };

                                // Handle new tools
                                if (fc.name === 'navigate_to_position') {
                                    result = navigateToPosition(args.position);
                                }
                                else if (fc.name === 'analyze_viewport') {
                                    analyzeViewport();
                                    result = {
                                        ok: true,
                                        message: `Viewport analyzed: ${viewportElements.length} elements visible. ${viewportElements.slice(0, 3).map(e => e.type).join(', ')}...`
                                    };
                                }
                                else if (fc.name === 'perform_element_action') {
                                    result = interactWithElement(
                                        args.action,
                                        args.element_index,
                                        args.selector,
                                        args.value
                                    );
                                }
                                else if (fc.name === 'toggle_visual_assist') {
                                    setShowVisualAssist(prev => !prev);
                                    result = { ok: true, message: `Visual assist ${showVisualAssist ? 'disabled' : 'enabled'}` };
                                }
                                else if (fc.name === 'disconnect_assistant') {
                                    disconnect();
                                    result = { ok: true, message: "Disconnected." };
                                }
                                // Handle existing tools (same logic as before)
                                else if (fc.name === 'get_system_state') {
                                    result = { ok: true, message: generateStateReport() };
                                }
                                else if (fc.name === 'control_scroll') {
                                    const direction = args.direction || 'DOWN';
                                    const intensity = args.intensity || 'NORMAL';
                                    let amount = window.innerHeight * 0.5; // Default NORMAL

                                    if (intensity === 'SMALL') amount = window.innerHeight * 0.25;
                                    if (intensity === 'LARGE') amount = window.innerHeight * 0.9;

                                    if (direction === 'UP') amount = -amount;

                                    window.scrollBy({ top: amount, behavior: 'smooth' });
                                    result = { ok: true, message: `Scrolled ${direction} (${intensity})` };
                                }
                                else if (fc.name === 'update_dashboard') {
                                    onCommandRef.current(args);
                                    result = { ok: true, message: "Dashboard updated." };
                                }
                                else if (fc.name === 'update_composite_settings') {
                                    onCommandRef.current({ compositeAction: true, ...args });
                                    result = { ok: true, message: "Composite settings updated." };
                                }
                                else if (fc.name === 'update_native_input') {
                                    onCommandRef.current({ updateNative: args });
                                    result = { ok: true, message: "Native input updated." };
                                }
                                else if (fc.name === 'trigger_native_generation') {
                                    onCommandRef.current({ triggerNative: true, ...args });
                                    result = { ok: true, message: "Generation triggered." };
                                }
                                else if (fc.name === 'perform_item_action') {
                                    onCommandRef.current({ itemAction: args.action, targetIndex: args.targetIndex });
                                    result = { ok: true, message: `Item action ${args.action} performed.` };
                                }
                                else if (fc.name === 'apply_settings_globally') {
                                    onApplyAllRef.current();
                                    result = { ok: true, message: "Settings applied globally." };
                                }
                                else if (fc.name === 'start_processing_queue') {
                                    onCommandRef.current({ startQueue: true });
                                    result = { ok: true, message: "Queue processing started." };
                                }
                                else if (fc.name === 'analyze_images') {
                                    onAuditRef.current();
                                    result = { ok: true, message: "Analysis started." };
                                }
                                else if (fc.name === 'manage_ui_state') {
                                    onCommandRef.current({ uiAction: args.action, value: args.value });
                                    result = { ok: true, message: `UI State: ${args.action}` };
                                }
                                else if (fc.name === 'manage_queue_actions') {
                                    onCommandRef.current({ queueAction: args.action });
                                    result = { ok: true, message: `Queue action: ${args.action}` };
                                }
                                else if (fc.name === 'read_documentation') {
                                    const docText = resources[currentLanguage]?.translation?.documentation || "Documentation not available.";
                                    result = { ok: true, message: docText.substring(0, 1000) + "..." };
                                }
                                else if (fc.name === 'control_pod_module') {
                                    onCommandRef.current({ podAction: args.action, ...args });
                                    result = { ok: true, message: `POD action: ${args.action}` };
                                }

                                functionResponses.push({
                                    name: fc.name,
                                    id: fc.id,
                                    response: { result }
                                });
                            }

                            sessionPromise.then(s => s.sendToolResponse({ functionResponses }));
                            setIsExecuting(false);
                        }
                    },
                    onclose: () => {
                        setIsActive(false);
                        setIsConnecting(false);
                    },
                    onError: (e) => {
                        console.error("Gemini Live Error:", e);
                        setIsActive(false);
                        setIsConnecting(false);
                        toast.error("Connection error");
                    }
                }
            });

        } catch (error) {
            console.error("Connection failed:", error);
            setIsConnecting(false);
            toast.error("Failed to connect to Voice Assistant");
        }
    };

    const disconnect = useCallback(async () => {
        if (sessionRef.current) {
            // sessionRef.current.close(); // API doesn't have explicit close, just stop streams
            sessionRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (inputAudioContextRef.current) {
            await inputAudioContextRef.current.close();
            inputAudioContextRef.current = null;
        }

        if (audioContextRef.current) {
            await audioContextRef.current.close();
            audioContextRef.current = null;
        }

        setIsActive(false);
    }, []);

    // Visual Assist Overlay
    const VisualAssistOverlay = () => {
        if (!showVisualAssist) return null;

        return (
            <div className="fixed inset-0 z-[10000] pointer-events-none">
                {viewportElements.map((el, i) => (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: el.rect.left,
                            top: el.rect.top,
                            width: el.rect.width,
                            height: el.rect.height,
                            border: '2px solid rgba(0, 255, 0, 0.5)',
                            backgroundColor: 'rgba(0, 255, 0, 0.1)',
                        }}
                    >
                        <span className="absolute -top-6 left-0 bg-black/80 text-green-400 text-xs px-1 rounded">
                            {el.type} {el.index !== undefined ? `#${el.index}` : ''}
                        </span>
                    </div>
                ))}
                <div className="absolute top-4 right-4 bg-black/80 text-white p-4 rounded-lg font-mono text-xs">
                    <p>Scroll: {scrollPosition.top}px ({scrollPosition.percent}%)</p>
                    <p>Elements: {viewportElements.length}</p>
                </div>
            </div>
        );
    };

    return (
        <>
            <VisualAssistOverlay />
            <motion.button
                onClick={isActive ? disconnect : startSession}
                className={`fixed bottom-8 right-8 z-[9999] p-4 rounded-full shadow-2xl backdrop-blur-xl border transition-all duration-300 group ${isActive
                    ? 'bg-red-500/10 border-red-500/50 hover:bg-red-500/20'
                    : 'bg-indigo-500/10 border-indigo-500/50 hover:bg-indigo-500/20'
                    }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                <div className="relative">
                    {isConnecting ? (
                        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    ) : isActive ? (
                        <>
                            <span className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                            <Mic className="w-8 h-8 text-red-400 relative z-10" />
                        </>
                    ) : (
                        <MicOff className="w-8 h-8 text-indigo-400 group-hover:text-indigo-300" />
                    )}

                    {/* Status Bubble */}
                    <div className={`absolute -top-2 -right-2 w-4 h-4 rounded-full border-2 border-[#020617] ${isActive ? 'bg-green-500' : 'bg-slate-500'
                        }`} />
                </div>

                {/* Volume Visualizer Ring */}
                {isActive && (
                    <svg className="absolute inset-0 -m-1 w-[calc(100%+8px)] h-[calc(100%+8px)] pointer-events-none">
                        <circle
                            cx="50%"
                            cy="50%"
                            r="24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-indigo-500/30"
                            style={{
                                r: 24 + (volume / 255) * 10
                            }}
                        />
                    </svg>
                )}
            </motion.button>
        </>
    );
};
