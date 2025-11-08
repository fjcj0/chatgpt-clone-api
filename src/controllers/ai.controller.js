import { response, request } from "express";
import { sql } from "../config/db.js";
export const getAllChats = async (request, response) => {
    try {
        const { clerk_id } = request.params;
        const chats = await sql`
            SELECT id, title, created_at, updated_at
            FROM chats 
            WHERE clerk_id = ${clerk_id}
            ORDER BY updated_at DESC;
        `;
        return response.status(200).json({
            success: true,
            chats
        });
    } catch (error) {
        console.log(error.message);
        return response.status(500).json({
            success: false,
            message: 'Error fetching chats'
        });
    }
};
export const getMessagesFromChat = async (request, response) => {
    try {
        const { chat_id, clerk_id } = request.params;
        const messages = await sql`
            SELECT m.* 
            FROM messages m
            JOIN chats c ON m.chat_id = c.id
            WHERE m.chat_id = ${chat_id} 
            AND c.clerk_id = ${clerk_id}
            ORDER BY m.created_at ASC;
        `;
        return response.status(200).json({
            success: true,
            messages
        });
    } catch (error) {
        console.log(error.message);
        return response.status(500).json({
            success: false,
            message: 'Error fetching messages'
        });
    }
};
export const deleteChat = async (request, response) => {
    try {
        const { chat_id, clerk_id } = request.params;
        await sql`
            DELETE FROM messages 
            WHERE chat_id = ${chat_id} 
            AND chat_id IN (
                SELECT id FROM chats WHERE clerk_id = ${clerk_id}
            );
        `;
        await sql`
            DELETE FROM chats 
            WHERE id = ${chat_id} 
            AND clerk_id = ${clerk_id};
        `;
        return response.status(200).json({
            success: true,
            message: 'Chat deleted successfully!'
        });
    } catch (error) {
        console.log(error.message);
        return response.status(500).json({
            success: false,
            message: 'Error deleting chat'
        });
    }
};
export const deleteAllChats = async (request, response) => {
    try {
        const { clerk_id } = request.params;
        await sql`
            DELETE FROM messages 
            WHERE chat_id IN (
                SELECT id FROM chats WHERE clerk_id = ${clerk_id}
            );
        `;
        await sql`DELETE FROM chats WHERE clerk_id = ${clerk_id};`;
        return response.status(200).json({
            success: true,
            message: 'All chats deleted successfully!'
        });
    } catch (error) {
        console.log(error.message);
        return response.status(500).json({
            success: false,
            message: 'Error deleting all chats'
        });
    }
};