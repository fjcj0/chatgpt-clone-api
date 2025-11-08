import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI(process.env.GEMENIE_API_KEY);
async function askAi() {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Explain how AI works in a few words",
    });
    return response.text;
}
async function orderImageFromAi() {
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: 'Robot holding a red skateboard',
        config: {
            numberOfImages: 1,
        },
    });
    return response.generatedImages.map(generatedImage =>
        generatedImage.image.imageBytes
    );
}
export default { orderImageFromAi, askAi };