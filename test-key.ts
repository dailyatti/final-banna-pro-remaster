import { GoogleGenAI } from "@google/genai";
import * as fs from 'fs';

const apiKey = "AIzaSyArNLGQu-Vy2KJp5acMzSK3sPgkZqhIoXY";

async function runTests() {
    console.log("--- STARTING MODEL AVAILABILITY TESTS ---");
    const results: Record<string, string | boolean> = {};

    const test = async (name: string) => {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const model = ai.models.generateContent({
                model: name,
                contents: { parts: [{ text: "Hello" }] }
            });
            await model;
            return true;
        } catch (error: any) {
            return error.message || "Unknown error";
        }
    };

    // Test the user's requested models
    results['gemini-3-pro-image-preview'] = await test('gemini-3-pro-image-preview');
    results['gemini-2.5-flash-image'] = await test('gemini-2.5-flash-image');

    // Test known working models for comparison
    results['gemini-1.5-flash'] = await test('gemini-1.5-flash');
    results['gemini-1.5-pro'] = await test('gemini-1.5-pro');
    results['gemini-2.0-flash-exp'] = await test('gemini-2.0-flash-exp');

    fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
    console.log("--- TESTS COMPLETE ---");
}

runTests();
