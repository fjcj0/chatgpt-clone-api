import { response } from "express";
import { sql } from "../config/db.js";
export const getMessages = async (request, response) => {
    try {
        const { chat_id, clerk_id } = request.params;
        const messages = await sql`
        SELECT * FROM messages WHERE chat_id = ${chat_id} AND
        clerk_id = ${clerk_id};
        `;
        return response.status(200).json({
            messages
        });
    } catch (error) {
        console.log(error.message);
    }
};
export const deleteChat = async (request, response) => {
    try {
        const { chat_id, clerk_id } = request.params;
        await sql`
        DELETE FROM messages WHERE chat_id = ${chat_id} AND
        clerk_id = ${clerk_id};
        `;
        return response.status(200).json({
            message: 'Messages Deleted Successfully!!'
        });
    } catch (error) {
        console.log(error.message);
    }
};
export const deleteAllChats = async (request, response) => {
    try {
        const { clerk_id } = request.params;
        await sql`DELETE FROM messages WHERE clerk_id = ${clerk_id};`;
        return response.status(200).json({
            message: 'Messages Deleted Successfully!!'
        });
    } catch (error) {
        console.log(error.message);
    }
};