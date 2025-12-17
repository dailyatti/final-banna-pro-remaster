/**
 * Image Provider Factory
 * Unified abstraction layer for Gemini and OpenAI image APIs
 */

import { ImageProvider, ImageItem, OutputFormat, AiResolution, AspectRatio } from '../types';

// Gemini imports
import {
    processImageWithGemini,
    generateImageFromText as generateImageFromTextGemini,
    processCompositeGeneration as processCompositeGenerationGemini,
    processGenerativeFill as processGenerativeFillGemini,
    extractTextFromImages as extractTextFromImagesGemini,
    enhancePrompt as enhancePromptGemini
} from './geminiService';

// OpenAI imports
import {
    generateImageFromTextGPT,
    processImageWithGPT,
    processCompositeGenerationGPT,
    enhancePromptGPT
} from './openaiService';

export interface ImageGenerationConfig {
    format: OutputFormat;
    resolution: AiResolution;
    aspectRatio: AspectRatio;
}

/**
 * Unified image generation from text prompt
 */
export const generateImage = async (
    provider: ImageProvider,
    apiKey: string,
    prompt: string,
    config: ImageGenerationConfig
): Promise<{ processedUrl: string; width: number; height: number; size: number }> => {
    if (provider === 'openai') {
        return generateImageFromTextGPT(apiKey, prompt, config);
    }
    return generateImageFromTextGemini(apiKey, prompt, config);
};

/**
 * Unified image processing with AI
 */
export const processImage = async (
    provider: ImageProvider,
    apiKey: string,
    item: ImageItem
): Promise<{ processedUrl: string; width: number; height: number; size: number }> => {
    if (provider === 'openai') {
        return processImageWithGPT(apiKey, item);
    }
    return processImageWithGemini(apiKey, item);
};

/**
 * Unified composite generation
 */
export const processComposite = async (
    provider: ImageProvider,
    apiKey: string,
    images: ImageItem[],
    prompt: string,
    config: ImageGenerationConfig
): Promise<{ processedUrl: string; width: number; height: number; size: number }> => {
    if (provider === 'openai') {
        return processCompositeGenerationGPT(apiKey, images, prompt, config);
    }
    return processCompositeGenerationGemini(apiKey, images, prompt, config);
};

/**
 * Unified generative fill
 * Note: OpenAI doesn't have native generative fill, falls back to Gemini
 */
export const processGenerativeFill = async (
    provider: ImageProvider,
    apiKey: string,
    geminiApiKey: string,
    imageBlob: Blob,
    format: OutputFormat = OutputFormat.PNG
): Promise<{ processedUrl: string; width: number; height: number; size: number }> => {
    // Always use Gemini for generative fill as OpenAI doesn't have equivalent
    return processGenerativeFillGemini(geminiApiKey, imageBlob, format);
};

/**
 * Unified OCR/text extraction
 * Note: OpenAI doesn't have native OCR, falls back to Gemini
 */
export const extractTextFromImages = async (
    provider: ImageProvider,
    apiKey: string,
    geminiApiKey: string,
    images: ImageItem[]
): Promise<string> => {
    // Always use Gemini for OCR as it's superior for this task
    return extractTextFromImagesGemini(geminiApiKey, images);
};

/**
 * Unified prompt enhancement
 */
export const enhancePrompt = async (
    provider: ImageProvider,
    apiKey: string,
    originalPrompt: string
): Promise<string> => {
    if (provider === 'openai') {
        return enhancePromptGPT(apiKey, originalPrompt);
    }
    return enhancePromptGemini(apiKey, originalPrompt);
};

/**
 * Get provider display name
 */
export const getProviderDisplayName = (provider: ImageProvider): string => {
    return provider === 'openai' ? 'OpenAI GPT-1.5' : 'Google Gemini';
};

/**
 * Get provider icon/emoji
 */
export const getProviderIcon = (provider: ImageProvider): string => {
    return provider === 'openai' ? '🤖' : '✨';
};
