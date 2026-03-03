import { GoogleGenAI } from "@google/genai";

const apiKey = "AIzaSyArNLGQu-Vy2KJp5acMzSK3sPgkZqhIoXY";
const ai = new GoogleGenAI({ apiKey });

async function checkStatus() {
    console.log("Checking API Key Status...");
    console.log(`Key: ${apiKey.substring(0, 10)}...`);

    try {
        console.log("\n--- Listing Available Models ---");
        // Attempt to list models. If this fails, we'll know listing is restricted.
        try {
            const response = await ai.models.list();
            const models = response.models || [];

            if (models.length === 0) {
                console.log("No models found in the list.");
            } else {
                models.forEach((m: any) => {
                    console.log(`- ${m.name}`);
                });
            }
        } catch (e: any) {
            console.log("Could not list models:", e.message);
        }

        console.log("\n--- Testing Specific Models ---");
        const modelsToTest = [
            'gemini-3-pro-image-preview',
            'gemini-2.5-flash-image',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-2.0-flash-exp'
        ];

        for (const modelName of modelsToTest) {
            process.stdout.write(`Testing ${modelName}... `);
            try {
                // Minimal generation test
                await ai.models.generateContent({
                    model: modelName,
                    contents: { parts: [{ text: "test" }] }
                });
                console.log("✅ OK (Available)");
            } catch (error: any) {
                let msg = error.message || "Unknown error";
                if (msg.includes("404")) msg = "404 Not Found (Access Denied)";
                if (msg.includes("429")) msg = "429 Quota Exceeded (Limit: 0)";
                console.log(`❌ FAILED: ${msg}`);
            }
        }

    } catch (error: any) {
        console.error("Fatal Error checking status:", error);
    }
}

checkStatus();
