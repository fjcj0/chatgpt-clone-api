import "dotenv/config";
import express, { request, response } from 'express';
import http from 'http';
import { sql } from "./config/db.js";
import chatRoutes from './routes/ai.route.js';
const app = express();
app.use(express.json());
app.get('/cron', (request, response) => {
    return response.status(200).json({
        message: 'Server is running successfully!!'
    });
});
const server = http.createServer(app);
app.use('/api/chat', chatRoutes);
const initDb = async () => {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                clerk_id VARCHAR(255) NOT NULL,
                chat_id VARCHAR(255) NOT NULL,
                user_message TEXT NULL,
                ai_message TEXT NULL,
                ai_image TEXT NULL,
                user_image TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;
        console.log('Database initialized successfully!');
    } catch (error) {
        console.error('DB init error:', error.message);
        throw error;
    }
};
initDb()
    .then(() => {
        server.listen(process.env.PORT, () => {
            console.log(`Your localhost is http://localhost:${process.env.PORT}`);
        });
    })
    .catch(error => {
        console.error('Server failed to start:', error.message);
    });