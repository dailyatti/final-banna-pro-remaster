import { generateEditedImage } from './services/gemini';

// 1x1 white PNG base64 (no data URI prefix)
const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/5+BFwAE/wJ+6UeVAAAAAElFTkSuQmCC';

const apiKey = 'AIzaSyArNLGQu-Vy2KJp5acMzSK3sPgkZqhIoXY'; // user-provided key

(async () => {
    try {
        const result = await generateEditedImage(
            tinyPngBase64,
            'Enhance the image',
            '1:1', // aspect ratio placeholder (string now)
            false, // usePro
            apiKey
        );
        console.log('Generation succeeded:', result);
    } catch (e: any) {
        console.error('Generation failed:', e.message);
    }
})();
