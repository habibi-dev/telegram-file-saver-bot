import TelegramBot from "node-telegram-bot-api";
import {get} from "lodash";
import * as fs from "node:fs";
import axios from "axios";

export class TelegramMessageController {
    telegram: TelegramBot;

    constructor() {
        const token = get(process, "env.YOUR_BOT_TOKEN", "") as string;
        this.telegram = new TelegramBot(token, {polling: true});
        this.telegram.on("message", (message) => this.message(message));
    }

    async message(message: TelegramBot.Message) {
        const allowedExtensions = get(process, "env.ALLOWED_EXTENSIONS", "").split(",");
        const allowedUsername = get(process, "env.YOUR_USERNAME", "");
        const chatId = message.chat.id;

        // Check if the sender's username is allowed
        if (get(message, "from.username", "") !== allowedUsername) {
            await this.telegram.sendMessage(chatId, 'You are not authorized to send files to this bot.');
            return;
        }

        // Check for different file types (document, audio, video, photo, etc.)
        const file = message.document || message.audio || message.video || message.voice ||
            (message.photo ? message.photo[message.photo.length - 1] : null); // The last photo is usually the highest resolution

        // If no file is found, prompt the user to send a file
        if (!file) {
            return await this.telegram.sendMessage(chatId, 'Please send a file.');
        }

        const fileSize = get(file, "file_size", 0);  // Get the file size in bytes
        const maxSize = 50 * 1024 * 1024; // 50 MB in bytes

        // Check if the file size exceeds the allowed limit (50 MB)
        if (fileSize > maxSize) {
            return await this.telegram.sendMessage(chatId, `The file is too big. Max allowed size is 50 MB.`);
        }

        // Get file information
        const fileId = get(file, "file_id", "");
        const fileName = get(file, "file_name", `file_${fileId}`); // Default file name if not available
        const fileExtension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';

        // Check if the file extension is allowed
        if (!allowedExtensions.includes(fileExtension)) {
            await this.telegram.sendMessage(chatId, `Files with the .${fileExtension} extension are not allowed. Only ${allowedExtensions.join(", ")} files are accepted.`);
            return;
        }

        // Get the download link for the file
        try {
            const fileLink = await this.telegram.getFileLink(fileId);

            // Download and save the file on the server
            const filePath = get(process, "env.SAVE_PATH", "./files") + "/" + this.getTimeStamp() + "_" + fileName;
            const writer = fs.createWriteStream(filePath);

            await this.telegram.sendMessage(chatId, `Start download file ${fileName}  \n\n${this.getTimeStamp()}`);

            axios({
                url: fileLink,
                method: 'GET',
                responseType: 'stream'
            }).then(response => {
                response.data.pipe(writer);
                writer.on('finish', () => {
                    this.telegram.sendMessage(chatId, `File successfully saved: ${fileName} \n\n${this.getTimeStamp()}`);
                });
                writer.on('error', () => {
                    fs.unlinkSync(filePath);
                    this.telegram.sendMessage(chatId, 'An error occurred while saving the file.');
                });
            }).catch(err => {
                fs.unlinkSync(filePath);
                this.telegram.sendMessage(chatId, 'An error occurred while downloading the file.');
                console.error(err);
            });

        } catch (err) {
            await this.telegram.sendMessage(chatId, 'An error occurred while retrieving the file link.');
            console.error(err);
        }
    }

    getTimeStamp() {
        const date = new Date();
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();

        return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
    }
}
