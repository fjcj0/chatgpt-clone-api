import express from 'express';
import {
    getMessagesFromChat,
    deleteChat,
    deleteAllChats,
    getAllChats
} from '../controllers/ai.controller.js';
const route = express.Router();
route.get('/:clerk_id', getAllChats);
route.get('/messages/:chat_id/users/:clerk_id', getMessagesFromChat);
route.delete('/:chat_id/:clerk_id', deleteChat);
route.delete('/:clerk_id/chats', deleteAllChats);
export default route;