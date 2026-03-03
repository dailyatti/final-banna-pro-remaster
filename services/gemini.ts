/**
 * Generates an edited image using Gemini via Netlify Function
 * Implements "User-Key Passthrough" pattern to avoid CORS
 */
export const generateEditedImage = async (
  base64Image: string,
  prompt: string,
  aspectRatio: string,
  apiKey: string
) => {
  try {
    const response = await fetch('/.netlify/functions/nano-banana', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey,
        imageBase64: base64Image.split(',')[1] || base64Image, // Ensure we send only the data part if it has prefix
        prompt,
        aspectRatio
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    const data = await response.json();
    // App.tsx expects { url: string, mimeType: string }
    return {
      url: `data:image/jpeg;base64,${data.image}`,
      mimeType: 'image/jpeg'
    };

  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    throw new Error(error.message || "Failed to generate image");
  }
};

/**
 * Validates the API key via Netlify Function
 */
export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await fetch('/.netlify/functions/validate-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.valid;
  } catch (error) {
    console.error("API Key Validation Failed:", error);
    return false;
  }
};