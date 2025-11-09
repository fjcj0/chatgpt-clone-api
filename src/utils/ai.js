import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMENIE_API_KEY });
async function askAi(prompt) {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
    });
    return response.text;
}
async function generateImageFromAi(prompt) {
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
            numberOfImages: 1,
        },
    });
    return response.generatedImages.map(generatedImage =>
        generatedImage.image.imageBytes
    );
}
export default { generateImageFromAi, askAi };