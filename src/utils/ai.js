import "dotenv/config";
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
    const response = await fetch(
        "https://router.huggingface.co/fal-ai/fal-ai/stable-diffusion-v3-medium",
        {
            headers: {
                Authorization: `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
                "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify(prompt),
        }
    );
    const result = await response.blob();
    return result;
}
export default { generateImageFromAi, askAi };