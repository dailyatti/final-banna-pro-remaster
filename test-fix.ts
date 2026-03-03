
import { GoogleGenAI } from "@google/genai";

// 100x100 gray JPEG base64
const validJpegBase64 =
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCABkAGQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//Z';

const apiKey = 'YOUR_API_KEY_HERE';

(async () => {
    console.log("Starting test with gemini-3-pro-image-preview (with config)...");
    try {
        const ai = new GoogleGenAI({ apiKey });
        const modelName = 'gemini-3-pro-image-preview';

        // Config similar to original code
        const imageConfig = {
            aspectRatio: '1:1',
            imageSize: '2K'
        };

        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { inlineData: { data: validJpegBase64, mimeType: 'image/jpeg' } },
                    { text: "Generate a new professional-quality image in 1:1 aspect ratio based on this image." },
                ],
            },
            config: { imageConfig: imageConfig } as any
        });

        console.log("Response received!");

        // Inspect response
        // in new SDK, response structure might vary
        // @ts-ignore
        const generatedImage = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (generatedImage) {
            console.log("SUCCESS: Image generated! Length:", generatedImage.length);
        } else {
            console.log("FAILURE: No image data found.");
            console.log(JSON.stringify(response, null, 2));
        }

    } catch (e: any) {
        console.error("Test failed:", e.message);
        // @ts-ignore
        if (e.response) console.error("Error details:", JSON.stringify(e.response, null, 2));
    }
})();
