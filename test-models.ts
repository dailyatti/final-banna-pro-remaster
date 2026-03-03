
import { GoogleGenAI } from "@google/genai";

// 1x1 white PNG base64 (no data URI prefix)
const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/5+BFwAE/wJ+6UeVAAAAAElFTkSuQmCC';

const apiKey = 'AIzaSyCtRC5uVobR4E3ZhT1TG40kUgD2Wo5mncI'; // Updated user key

const candidateModels = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro-vision',
    'gemini-1.0-pro-vision-latest'
];

(async () => {
    console.log("--- STARTING MULTI-MODEL TEST ---");
    const ai = new GoogleGenAI({ apiKey });

    for (const modelName of candidateModels) {
        console.log(`\nTesting model: ${modelName}...`);
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: {
                    parts: [
                        { inlineData: { data: tinyPngBase64, mimeType: 'image/jpeg' } },
                        { text: "Describe this image in one word." }, // Simple text gen first
                    ],
                }
            });
            console.log(`SUCCESS: ${modelName} works for text generation!`);

            // If it supports text, try image generation? 
            // Most Gemini models support multimodal input (text+image -> text).
            // But we need image-to-image (image -> image) OR text-to-image.
            // The user's goal is image EDITING.
            // Let's stick to simple multimodal first to verify access.

        } catch (e: any) {
            console.log(`FAILURE: ${modelName} failed.`);
            if (e.message) console.log(`Error: ${e.message}`);
        }
    }
})();
