
import { Handler } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';

export const handler: Handler = async (event) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { apiKey, imageBase64, prompt, aspectRatio } = JSON.parse(event.body || '{}');

        if (!apiKey) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing API Key' }) };
        }

        if (!imageBase64) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing Image Data' }) };
        }

        const ai = new GoogleGenAI({ apiKey });

        // Primary Model: Gemini 3 Pro Image Preview
        const primaryModel = 'gemini-3-pro-image-preview';
        // Fallback Model: Gemini 2.5 Flash Image (more stable/faster)
        const fallbackModel = 'gemini-2.5-flash-image';

        // Build aspect ratio description for the prompt
        const aspectRatioDescriptions: { [key: string]: string } = {
            '1:1': 'square format (1:1 aspect ratio)',
            '3:4': 'portrait format (3:4 aspect ratio)',
            '4:3': 'landscape format (4:3 aspect ratio)',
            '9:16': 'vertical mobile format (9:16 aspect ratio)',
            '16:9': 'widescreen landscape format (16:9 aspect ratio)'
        };

        const aspectRatioDesc = aspectRatioDescriptions[aspectRatio] || `${aspectRatio} aspect ratio`;

        // Build effective prompt with explicit aspect ratio instruction
        let effectivePrompt = '';
        if (prompt && prompt.trim()) {
            effectivePrompt = `Generate a new professional-quality image in ${aspectRatioDesc} based on this image. ${prompt}`;
        } else {
            effectivePrompt = `Generate a new professional-quality image in ${aspectRatioDesc} based on this image. Maintain the subject and composition but adapt it perfectly to the new ${aspectRatioDesc} format. Enhance lighting, colors, and overall quality while ensuring the image fills the entire ${aspectRatioDesc} frame.`;
        }

        let response;
        try {
            console.log(`Attempting generation with ${primaryModel}...`);
            response = await ai.models.generateContent({
                model: primaryModel,
                contents: {
                    parts: [
                        { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } },
                        { text: effectivePrompt },
                    ],
                },
            });
        } catch (primaryError: any) {
            console.warn(`Primary model ${primaryModel} failed:`, primaryError.message);
            console.log(`Falling back to ${fallbackModel}...`);

            try {
                response = await ai.models.generateContent({
                    model: fallbackModel,
                    contents: {
                        parts: [
                            { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } },
                            { text: effectivePrompt },
                        ],
                    },
                });
            } catch (fallbackError: any) {
                console.error(`Fallback model ${fallbackModel} also failed:`, fallbackError.message);
                throw new Error(`Both models failed. Primary: ${primaryError.message}. Fallback: ${fallbackError.message}`);
            }
        }

        // Extract image
        const generatedImage = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (!generatedImage) {
            throw new Error("No image generated in response");
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: generatedImage }),
        };

    } catch (error: any) {
        console.error("Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || "Internal Server Error" }),
        };
    }
};
