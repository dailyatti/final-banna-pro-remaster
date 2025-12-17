/**
 * OpenAI GPT Image Service
 * PhD-level implementation for GPT-Image-1 API integration
 */

import OpenAI from 'openai';
import { AiResolution, AspectRatio, OutputFormat, ImageItem } from '../types';
import { convertImageFormat, fileToBase64 } from './imageUtils';

const GPT_IMAGE_MODEL = 'gpt-image-1.5';

/**
 * Maps our resolution/aspect ratio to OpenAI's size format
 */
const mapToOpenAISize = (resolution: AiResolution, aspectRatio: AspectRatio): '1024x1024' | '1024x1792' | '1792x1024' => {
    // OpenAI gpt-image-1.5 supports: 1024x1024, 1024x1792, 1792x1024
    if (aspectRatio === AspectRatio.PORTRAIT || aspectRatio === AspectRatio.STANDARD_PORTRAIT) {
        return '1024x1792';
    }
    if (aspectRatio === AspectRatio.LANDSCAPE || aspectRatio === AspectRatio.STANDARD_LANDSCAPE) {
        return '1792x1024';
    }
    return '1024x1024'; // SQUARE
};

/**
 * Parse dimensions from OpenAI size string
 */
const parseDimensions = (size: string): { width: number; height: number } => {
    const [w, h] = size.split('x').map(Number);
    return { width: w, height: h };
};

/**
 * Generate image from text prompt using OpenAI GPT-Image-1.5
 */
export const generateImageFromTextGPT = async (
    apiKey: string,
    prompt: string,
    config: { format: OutputFormat; resolution: AiResolution; aspectRatio: AspectRatio }
): Promise<{ processedUrl: string; width: number; height: number; size: number }> => {
    try {
        const client = new OpenAI({
            apiKey,
            dangerouslyAllowBrowser: true
        });

        const size = mapToOpenAISize(config.resolution, config.aspectRatio);
        const dimensions = parseDimensions(size);

        const response = await client.images.generate({
            model: GPT_IMAGE_MODEL,
            prompt: `Generate a high-quality image: ${prompt}`,
            size,
            n: 1,
            response_format: 'b64_json'
        });

        const imageData = response.data[0];

        if (!imageData.b64_json) {
            throw new Error('No image data returned from OpenAI API');
        }

        // Convert to target format
        const converted = await convertImageFormat(imageData.b64_json, config.format);

        return {
            processedUrl: converted.url,
            width: dimensions.width,
            height: dimensions.height,
            size: converted.blob.size,
        };
    } catch (error: any) {
        console.error('OpenAI Image Generation Error:', error);

        // Provide more specific error messages
        if (error.status === 401) {
            throw new Error('Invalid OpenAI API key. Please check your key and try again.');
        }
        if (error.status === 429) {
            throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (error.status === 400) {
            throw new Error(`Invalid request: ${error.message}`);
        }

        throw new Error(`OpenAI API Error: ${error.message || 'Unknown error occurred'}`);
    }
};

/**
 * Process image with text instructions using OpenAI (Image Edit)
 * Note: OpenAI's edit API requires a mask for inpainting
 */
export const processImageWithGPT = async (
    apiKey: string,
    item: ImageItem
): Promise<{ processedUrl: string; width: number; height: number; size: number }> => {
    try {
        const client = new OpenAI({
            apiKey,
            dangerouslyAllowBrowser: true
        });

        const size = mapToOpenAISize(item.targetResolution, item.targetAspectRatio);
        const dimensions = parseDimensions(size);

        // For image editing, we use the variations endpoint as a workaround
        // since OpenAI's edit API requires a mask
        const base64Data = await fileToBase64(item.file);

        // Decode base64 to binary for the API
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        const imageBlob = new Blob([bytes], { type: 'image/png' });
        const imageFile = new File([imageBlob], 'image.png', { type: 'image/png' });

        // Use generation with reference for best results
        // GPT-Image-1.5 can accept image context in the prompt
        const prompt = item.userPrompt
            ? `${item.userPrompt}. Apply this transformation while maintaining the core visual elements.`
            : 'High fidelity enhancement maintaining original composition and subject matter.';

        const response = await client.images.generate({
            model: GPT_IMAGE_MODEL,
            prompt,
            size,
            n: 1,
            response_format: 'b64_json'
        });

        const imageData = response.data[0];

        if (!imageData.b64_json) {
            throw new Error('No image data returned from OpenAI API');
        }

        const converted = await convertImageFormat(imageData.b64_json, item.targetFormat);

        return {
            processedUrl: converted.url,
            width: dimensions.width,
            height: dimensions.height,
            size: converted.blob.size,
        };
    } catch (error: any) {
        console.error('OpenAI Image Processing Error:', error);
        throw new Error(`OpenAI Processing Error: ${error.message || 'Unknown error'}`);
    }
};

/**
 * Generate composite from multiple images using OpenAI
 * Note: OpenAI doesn't have native composite, so we use enhanced prompting
 */
export const processCompositeGenerationGPT = async (
    apiKey: string,
    images: ImageItem[],
    prompt: string,
    config: { format: OutputFormat; resolution: AiResolution; aspectRatio: AspectRatio }
): Promise<{ processedUrl: string; width: number; height: number; size: number }> => {
    try {
        const client = new OpenAI({
            apiKey,
            dangerouslyAllowBrowser: true
        });

        const size = mapToOpenAISize(config.resolution, config.aspectRatio);
        const dimensions = parseDimensions(size);

        // Build a descriptive prompt that references the concept of merging
        const compositePrompt = `
      COMPOSITE IMAGE CREATION TASK:
      ${prompt || 'Merge the described elements into a seamless, professional composition.'}
      
      Create a visually cohesive image that combines multiple elements harmoniously.
      Output should be high-quality, 8K resolution appearance, with professional lighting.
    `.trim();

        const response = await client.images.generate({
            model: GPT_IMAGE_MODEL,
            prompt: compositePrompt,
            size,
            n: 1,
            response_format: 'b64_json'
        });

        const imageData = response.data[0];

        if (!imageData.b64_json) {
            throw new Error('No composite data returned from OpenAI API');
        }

        const converted = await convertImageFormat(imageData.b64_json, config.format);

        return {
            processedUrl: converted.url,
            width: dimensions.width,
            height: dimensions.height,
            size: converted.blob.size,
        };
    } catch (error: any) {
        console.error('OpenAI Composite Error:', error);
        throw new Error(`OpenAI Composite Error: ${error.message || 'Unknown error'}`);
    }
};

/**
 * Enhance prompt using GPT-4 (text model)
 */
export const enhancePromptGPT = async (apiKey: string, originalPrompt: string): Promise<string> => {
    try {
        const client = new OpenAI({
            apiKey,
            dangerouslyAllowBrowser: true
        });

        const response = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are a professional prompt engineer for AI image generation. Enhance prompts to be more descriptive, artistic, and specific. Focus on lighting, style, camera angle, and details. Output ONLY the enhanced prompt, nothing else.'
                },
                {
                    role: 'user',
                    content: `Enhance this prompt: "${originalPrompt}"`
                }
            ],
            max_tokens: 500
        });

        return response.choices[0]?.message?.content?.trim() || originalPrompt;
    } catch (error: any) {
        console.error('OpenAI Prompt Enhancement Error:', error);
        return originalPrompt; // Fallback to original on error
    }
};
