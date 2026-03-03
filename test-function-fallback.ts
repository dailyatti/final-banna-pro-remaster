
import { handler } from './netlify/functions/nano-banana.ts';

// 100x100 gray JPEG base64
const validJpegBase64 =
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCABkAGQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//Z';

const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
        apiKey: 'AIzaSyCtRC5uVobR4E3ZhT1TG40kUgD2Wo5mncI',
        imageBase64: validJpegBase64,
        prompt: 'Generate a new professional-quality image in 1:1 aspect ratio based on this image.',
        aspectRatio: '1:1'
    }),
} as any;

(async () => {
    console.log("--- Starting Fallback Logic Verification ---");
    try {
        const result = await handler(event, {} as any, () => { });

        console.log("Function returned status:", result?.statusCode);

        if (result?.statusCode === 200) {
            const body = JSON.parse(result.body || '{}');
            if (body.image) {
                console.log("SUCCESS: Image generated! Length:", body.image.length);
            } else {
                console.log("SUCCESS (Partial): 200 OK but no image property?", body);
            }
        } else {
            console.log("FAILURE: Status code", result?.statusCode);
            console.log("Body:", result?.body);
        }

    } catch (e: any) {
        console.error("Test failed with exception:", e.message);
    }
})();
