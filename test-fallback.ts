import { handler } from './netlify/functions/nano-banana';

// tiny 1x1 white PNG base64 (no data URI prefix)
const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/5+BFwAE/wJ+6UeVAAAAAElFTkSuQmCC';

const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
        apiKey: 'AIzaSyArNLGQu-Vy2KJp5acMzSK3sPgkZqhIoXY',
        imageBase64: tinyPngBase64,
        prompt: 'Enhance the image',
        aspectRatio: '1:1',
        usePro: false,
    }),
} as any;

(async () => {
    try {
        const response = await handler(event);
        console.log('Handler response:', response);
    } catch (e) {
        console.error('Error invoking handler:', e);
    }
})();
