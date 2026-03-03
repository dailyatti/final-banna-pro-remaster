
import { Handler } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';

export const handler: Handler = async (event) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { apiKey } = JSON.parse(event.body || '{}');

        if (!apiKey) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing API Key' }) };
        }

        const ai = new GoogleGenAI({ apiKey });

        // Simple validation check using a cheap model
        try {
            await ai.models.generateContent({
                model: 'gemini-1.5-flash',
                contents: {
                    parts: [{ text: 'test' }]
                }
            });

            return {
                statusCode: 200,
                body: JSON.stringify({ valid: true }),
            };

        } catch (error: any) {
            console.error("Key Validation API Error:", error.message);

            const msg = error.message || '';
            // If error indicates invalid key, return false
            if (msg.includes('API key not valid') || msg.includes('400') || msg.includes('403')) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({ valid: false, reason: msg }),
                };
            }

            // Otherwise, return true (service issue, not key issue)
            return {
                statusCode: 200,
                body: JSON.stringify({ valid: true, warning: "Service unstable but key likely valid" }),
            };
        }

    } catch (error: any) {
        console.error("Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || "Internal Server Error" }),
        };
    }
};
