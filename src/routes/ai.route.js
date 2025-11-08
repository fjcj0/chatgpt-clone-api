import express from 'express';
import { deleteAllChats, deleteChat, getMessages } from '../controllers/ai.controller.js';
const route = express.Router();
route.get('/:chat_id/:clerk_id', getMessages);
route.delete('/:chat_id/:clerk_id', deleteChat);
route.delete('/:clerk_id', deleteAllChats);
export default route;