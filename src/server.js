import "dotenv/config";
import express from 'express';
import http from 'http';
import { sql } from "./config/db.js";
import { Server } from "socket.io";
import chatRoutes from './routes/ai.route.js';
import cors from 'cors';
import aiService from './utils/ai.js';
const app = express();
app.use(cors({
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST", "DELETE", "PUT"],
    credentials: true
}));
app.use(express.json());
app.get('/cron', (request, response) => {
    return response.status(200).json({
        message: 'Server is running successfully!!'
    });
});
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL,
        methods: ["GET", "POST"],
        credentials: true,
    },
});
const shouldGenerateImage = (content) => {
    const imageKeywords = [
        'generate', 'create', 'make', 'draw', 'design', 'produce',
        'image', 'picture', 'photo', 'illustration', 'art', 'drawing',
        'visual', 'graphic', 'poster', 'logo', 'meme'
    ];
    const lowerContent = content.toLowerCase();
    return imageKeywords.some(keyword => lowerContent.includes(keyword));
};
const extractImagePrompt = (content) => {
    const prompt = content
        .replace(/(generate|create|make|draw|design|produce)\s+(an|a|the)?\s+(image|picture|photo|illustration|art|drawing|visual|graphic)\s+(of)?/gi, '')
        .replace(/\b(please|can you|could you|i want|i need)\b/gi, '')
        .trim();
    return prompt || content;
};
io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);
    socket.on('sendMessageToAi', async (data) => {
        try {
            const { chatId, content, clerkId, image } = data;
            if (!clerkId) {
                socket.emit('error', { error: 'User must be logged in' });
                return;
            }
            let curChatID = chatId;
            let userMessage;
            if (!chatId) {
                const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
                const newChat = await sql`
                    INSERT INTO chats(clerk_id, title)
                    VALUES (${clerkId}, ${title}) 
                    RETURNING *;
                `;
                curChatID = newChat[0].id;
                userMessage = await sql`
                    INSERT INTO messages(chat_id, role, image, content)
                    VALUES (${newChat[0].id}, 'user', ${image}, ${content})
                    RETURNING *;
                `;
                socket.emit("receive", {
                    chat: newChat[0],
                    userMessage: userMessage[0]
                });
            } else {
                const existingChat = await sql`
                    SELECT id FROM chats WHERE id = ${chatId} AND clerk_id = ${clerkId}
                `;
                if (existingChat.length === 0) {
                    socket.emit('error', { error: 'Chat not found or access denied' });
                    return;
                }
                userMessage = await sql`
                    INSERT INTO messages(chat_id, role, image, content)
                    VALUES (${curChatID}, 'user', ${image}, ${content})
                    RETURNING *;
                `;
                socket.emit("receive", {
                    userMessage: userMessage[0]
                });
            }
            try {
                if (shouldGenerateImage(content)) {
                    const imagePrompt = extractImagePrompt(content);
                    const imageData = await aiService.generateImageFromAi(imagePrompt);
                    const imageMessage = await sql`
                        INSERT INTO messages(chat_id, role, content, image)
                        VALUES (${curChatID}, 'assistant', ${`Generated image: ${imagePrompt}`}, ${imageData[0]})
                        RETURNING *;
                    `;
                    socket.emit("aiResponse", {
                        message: imageMessage[0],
                        chatId: curChatID,
                        type: 'image'
                    });
                } else {
                    let aiResponse;
                    if (image) {
                        aiResponse = await aiService.askAi(`User message: ${content}. [Image attached]`);
                    } else {
                        aiResponse = await aiService.askAi(content);
                    }
                    const assistantMessage = await sql`
                        INSERT INTO messages(chat_id, role, content)
                        VALUES (${curChatID}, 'assistant', ${aiResponse})
                        RETURNING *;
                    `;
                    socket.emit("aiResponse", {
                        message: assistantMessage[0],
                        chatId: curChatID,
                        type: 'text'
                    });
                }
                await sql`
                    UPDATE chats 
                    SET updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ${curChatID}
                `;
            } catch (aiError) {
                console.error('AI response error:', aiError.message);
                const errorMessage = await sql`
                    INSERT INTO messages(chat_id, role, content)
                    VALUES (${curChatID}, 'assistant', ${'Sorry, I encountered an error processing your request.'})
                    RETURNING *;
                `;
                socket.emit("aiResponse", {
                    message: errorMessage[0],
                    chatId: curChatID,
                    error: true
                });
            }
        } catch (error) {
            console.log('Socket error:', error.message);
            socket.emit('error', { error: 'Internal server error' });
        }
    });
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});
app.use('/api/chat', chatRoutes);
const initDb = async () => {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS chats (
                id SERIAL PRIMARY KEY,
                clerk_id VARCHAR(255) NOT NULL,
                title VARCHAR(500) DEFAULT 'New Chat',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
                image TEXT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        const indexes = [
            { name: 'idx_chats_clerk_id', sql: sql`CREATE INDEX IF NOT EXISTS idx_chats_clerk_id ON chats(clerk_id);` },
            { name: 'idx_chats_updated_at', sql: sql`CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at);` },
            { name: 'idx_messages_chat_id', sql: sql`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);` },
            { name: 'idx_messages_created_at', sql: sql`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);` }
        ];
        for (const index of indexes) {
            try {
                await index.sql;
            } catch (error) {
                console.log(`Index ${index.name} might already exist or there was an error:`, error.message);
            }
        }
        console.log('Database initialized successfully!');
    } catch (error) {
        console.log('DB init error:', error.message);
        throw error;
    }
};
initDb()
    .then(() => {
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    })
    .catch(error => {
        console.error('Server failed to start:', error.message);
        process.exit(1);
    });