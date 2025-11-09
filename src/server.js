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
const fixDatabaseSequences = async () => {
    try {
        const maxChatId = await sql`SELECT COALESCE(MAX(id), 0) as max_id FROM chats`;
        await sql`SELECT setval('chats_id_seq', ${maxChatId[0].max_id}, true)`;
        const maxMessageId = await sql`SELECT COALESCE(MAX(id), 0) as max_id FROM messages`;
        await sql`SELECT setval('messages_id_seq', ${maxMessageId[0].max_id}, true)`;
        console.log('Database sequences fixed successfully');
    } catch (error) {
        console.log('Error fixing sequences:', error.message);
    }
};
io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);
    socket.on('sendMessageToAi', async (data) => {
        let curChatID = null;
        try {
            const { chatId, content, clerkId, image } = data;
            if (!clerkId) {
                socket.emit('error', { error: 'User must be logged in' });
                return;
            }
            if (!content || content.trim() === '') {
                socket.emit('error', { error: 'Message content cannot be empty' });
                return;
            }
            let userMessage;
            console.log('Processing message for user:', clerkId, 'chat:', chatId);
            if (!chatId || chatId === null || chatId === 0) {
                try {
                    const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
                    console.log('Creating new chat for user:', clerkId);
                    const newChat = await sql`
                        INSERT INTO chats (clerk_id, title)
                        VALUES (${clerkId}, ${title}) 
                        RETURNING *;
                    `;
                    if (!newChat || newChat.length === 0) {
                        throw new Error('Failed to create new chat');
                    }
                    curChatID = newChat[0].id;
                    console.log('New chat created with ID:', curChatID, 'for user:', clerkId);
                    userMessage = await sql`
                        INSERT INTO messages (chat_id, role, image, content)
                        VALUES (${curChatID}, 'user', ${image || null}, ${content.trim()})
                        RETURNING *;
                    `;
                    socket.emit("receive", {
                        chat: newChat[0],
                        userMessage: userMessage[0]
                    });
                } catch (chatError) {
                    console.error('Chat creation error:', chatError);
                    socket.emit('error', { error: 'Failed to create chat: ' + chatError.message });
                    return;
                }
            } else {
                try {
                    const existingChat = await sql`
                        SELECT id FROM chats 
                        WHERE id = ${chatId} AND clerk_id = ${clerkId}
                    `;
                    if (existingChat.length === 0) {
                        console.log('Chat not found or access denied:', chatId, 'for user:', clerkId);
                        socket.emit('error', { error: 'Chat not found or access denied' });
                        return;
                    }
                    curChatID = chatId;
                    userMessage = await sql`
                        INSERT INTO messages (chat_id, role, image, content)
                        VALUES (${curChatID}, 'user', ${image || null}, ${content.trim()})
                        RETURNING *;
                    `;
                    socket.emit("receive", {
                        userMessage: userMessage[0]
                    });
                } catch (messageError) {
                    console.error('Message insertion error:', messageError);
                    socket.emit('error', { error: 'Failed to save message: ' + messageError.message });
                    return;
                }
            }
            try {
                if (shouldGenerateImage(content)) {
                    const imagePrompt = extractImagePrompt(content);
                    console.log('Generating image for prompt:', imagePrompt);
                    const imageData = await aiService.generateImageFromAi(imagePrompt);
                    const imageMessage = await sql`
                        INSERT INTO messages (chat_id, role, content, image)
                        VALUES (${curChatID}, 'assistant', ${imagePrompt}, ${imageData[0]})
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
                        INSERT INTO messages (chat_id, role, content)
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
                    INSERT INTO messages (chat_id, role, content)
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
            console.error('Unexpected socket error:', error.message);
            socket.emit('error', { error: 'Internal server error: ' + error.message });
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
                console.log(`Index ${index.name} might already exist:`, error.message);
            }
        }
        console.log('Database initialized successfully!');
        await fixDatabaseSequences();

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