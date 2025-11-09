import "dotenv/config";
import { InferenceClient } from "@huggingface/inference";
const client = new InferenceClient(process.env.HUGGING_FACE_API_KEY);
async function askAi(prompt) {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMENIE_API_KEY });
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
    });
    return response.text;
}
async function generateImageFromAi(prompt) {
    try {
        console.log('Generating image with Stable Diffusion 3 Medium for prompt:', prompt);
        const image = await client.textToImage({
            provider: "fal-ai",
            model: "stabilityai/stable-diffusion-3-medium",
            inputs: prompt,
            parameters: {
                num_inference_steps: 20,
                guidance_scale: 7.5,
                width: 512,
                height: 512
            },
        });
        const arrayBuffer = await image.arrayBuffer();
        const base64Image = arrayBufferToBase64(arrayBuffer);
        console.log('Image generated successfully, size:', base64Image.length);
        return [`data:image/jpeg;base64,${base64Image}`];
    } catch (error) {
        console.log('Image generation error:', error);
        throw new Error(`Failed to generate image: ${error.message}`);
    }
}
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
export default { generateImageFromAi, askAi };