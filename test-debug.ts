
import { GoogleGenAI } from "@google/genai";

const apiKey = 'YOUR_API_KEY_HERE';

(async () => {
    console.log("Starting debug test with gemini-2.5-flash...");
    const ai = new GoogleGenAI({ apiKey });
    const modelName = 'gemini-2.5-flash';

    // Test 1: Simple Text Generation
    console.log("\n1. Testing Text Generation...");
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [{ text: "Hello, are you working?" }],
            }
        });
        console.log("Text Gen SUCCESS:", JSON.stringify(response, null, 2).substring(0, 200) + "...");
    } catch (e: any) {
        console.log("Text Gen FAILED:", e.message);
    }

    // Test 2: Image Generation (if supported)
    console.log("\n2. Testing Image Generation Prompt...");
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [{ text: "Generate an image of a red apple." }],
            }
        });
        // Check if we got image data back
        // @ts-ignore
        const imgData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (imgData) {
            console.log("Image Gen SUCCESS!");
        } else {
            console.log("Image Gen: Text response received (model might not support native image gen):",
                // @ts-ignore
                response.candidates?.[0]?.content?.parts?.[0]?.text);
        }
    } catch (e: any) {
        console.log("Image Gen FAILED:", e.message);
    }
})();
