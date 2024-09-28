import TelegramBot, {Message} from "node-telegram-bot-api";
import {chunk, get, isArray, isEmpty, isUndefined, trim} from "lodash";
import * as fs from "node:fs";
import {FileUtility} from "../utility/FileUtility";
import {basename} from "node:path";

export class TelegramMessageController {
    telegram: TelegramBot;
    path: string;
    folders = [];
    links: {
        link: string | TelegramBot.Document | TelegramBot.Voice | TelegramBot.PhotoSize,
        chatID: TelegramBot.ChatId,
        activeFolder: string
    }[] = [];
    downloadQueue: boolean = false;
    activeFolder: string = "";

    mainMenu = null;

    constructor() {
        this.path = get(process, "env.SAVE_PATH", "./files") + "/"
        this.folders = get(process, "env.FOLDERS", "").split(",")
        this.activeFolder = "/" + get(process, "env.DEFAULT_FOLDER", "") + "/"
        const token = get(process, "env.YOUR_BOT_TOKEN", "") as string;

        if (!isEmpty(this.folders))
            this.mainMenu = {
                reply_markup: {
                    keyboard: chunk(this.folders.map(folder => ({text: folder})), 3),
                    resize_keyboard: true,
                    one_time_keyboard: true,
                }
            };


        this.telegram = new TelegramBot(token, {polling: true});
        this.telegram.on("message", (message) => this.message(message));
    }

    async message(message: TelegramBot.Message) {
        const allowedUsername = get(process, "env.YOUR_USERNAME", "");
        const chatId = message.chat.id;
        const chatText = get(message, "text", "");
        const username = get(message, "from.username", "");

        // Check if the sender's username is allowed
        if (!allowedUsername.split(",").includes(username)) {
            await this.telegram.sendMessage(chatId, 'You are not authorized to send files to this bot.');
            return;
        }

        if (this.folders.includes(chatText)) {
            this.activeFolder = `/${chatText}/`;
            return await this.telegram.sendMessage(chatId, `Default folder changed to ${chatText}`, this.mainMenu);
        }

        if (chatText.match(/\/start/)) {
            return this.welcomeMessage(message);
        }

        // Check for different file types (document, audio, video, photo, etc.)
        const file = message.document || message.audio || message.video || message.voice ||
            (message.photo ? message.photo[message.photo.length - 1] : null); // The last photo is usually the highest resolution

        if (file) {
            await this.addToDownload(file, chatId)
            return;
        }

        const links = chatText.split(",")

        if (!isArray(links) && this.isUrl(chatText)) {
            await this.addToDownload(chatText, chatId);
            return;
        }

        if (isArray(links)) {
            for (const link of links) {
                if (this.isUrl(link)) {
                    await this.addToDownload(link, chatId)
                } else {
                    await this.telegram.sendMessage(chatId, 'Please send a file or link to this bot.', this.mainMenu);
                }
            }
            return;
        }


        return await this.telegram.sendMessage(chatId, 'Please send a file or link to this bot.', this.mainMenu);
    }

    private async addToDownload(link: any, chatID: number) {

        this.links.push({link: this.isUrl(link) ? trim(link) : link, chatID, activeFolder: this.activeFolder});

        await this.telegram.sendMessage(chatID,
            `The link was added to the download list \n\n Queued links: ${this.links.length - 1} \n\n${this.getTimeStamp()}`,
            this.mainMenu);

        await new Promise(resolve => setTimeout(resolve, 1000))

        await this.download();
    }

    private download() {
        if (this.downloadQueue) return;
        this.downloadQueue = true;
        const item = this.links.shift();

        if (isUndefined(item)) return;

        const {link, chatID, activeFolder} = item;

        if (this.isUrl(link.toString())) {
            return this.downloadLink(trim(link.toString()), chatID, activeFolder)
        }

        this.downloadFile(link as any, chatID, activeFolder)
    }

    private async downloadFinish() {
        const delay = get(process, "env.DELAY_FOR_DOWNLOAD", "0");
        this.downloadQueue = false;
        await new Promise(resolve => setTimeout(resolve, parseInt(delay)))
        await this.download();
    }

    private welcomeMessage(msg: Message): void {
        this.telegram.sendMessage(msg.chat.id, 'Welcome to the folder manager bot!', this.mainMenu);
    }

    private async downloadLink(link: string, chatId: TelegramBot.ChatId, activeFolder: string) {
        const allowedExtensions = get(process, "env.ALLOWED_EXTENSIONS", "").split(",");
        const url = new URL(link);
        const fileName = FileUtility.sanitizeFileName(decodeURIComponent((url.pathname.split("/").pop())));
        const fileExtension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';

        // Check if the file extension is allowed
        if (!allowedExtensions.includes(fileExtension)) {
            await this.telegram.sendMessage(chatId, `Files with the .${fileExtension} extension are not allowed. Only ${allowedExtensions.join(", ")} files are accepted.`, this.mainMenu);
            await this.downloadFinish();
            return;
        }

        try {
            // Download and save the file on the server
            FileUtility.mkdir(this.path + activeFolder);
            const filePath = this.path + activeFolder + this.getTimeStamp() + "_" + fileName;
            const writer = fs.createWriteStream(filePath);

            await this.telegram.sendMessage(chatId, `Start download file ${fileName}  \n\n${this.getTimeStamp()}`, this.mainMenu);

            FileUtility.download(url.href, writer,
                this.onDownloadSuccess.bind(this, chatId, fileName),
                this.onDownloadError.bind(this, chatId, filePath)
            );
        } catch (err) {
            await this.telegram.sendMessage(chatId, 'An error occurred while retrieving the file link.', this.mainMenu);
            await this.downloadFinish();
            console.error(err);
        }
    }

    private async downloadFile(file: TelegramBot.Document | TelegramBot.Voice | TelegramBot.PhotoSize, chatId: TelegramBot.ChatId, activeFolder: string) {
        const allowedExtensions = get(process, "env.ALLOWED_EXTENSIONS", "").split(",");
        const fileSize = get(file, "file_size", 0);  // Get the file size in bytes
        const maxSize = 20 * 1024 * 1024; // 20 MB in bytes

        // Check if the file size exceeds the allowed limit (20 MB)
        if (fileSize > maxSize) {
            return await this.telegram.sendMessage(chatId, `The file is too big. Max allowed size is 20 MB.`, this.mainMenu);
        }

        // Get file information
        const fileId = get(file, "file_id", "");
        const fileName = FileUtility.sanitizeFileName(decodeURIComponent(get(file, "file_name", `file_${fileId}`)));

        const fileExtension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';

        // Check if the file extension is allowed
        if (!allowedExtensions.includes(fileExtension)) {
            await this.downloadFinish();
            await this.telegram.sendMessage(chatId, `Files with the .${fileExtension} extension are not allowed. Only ${allowedExtensions.join(", ")} files are accepted.`, this.mainMenu);
            return;
        }

        // Get the download link for the file
        try {
            const fileLink = await this.telegram.getFileLink(fileId);

            // Download and save the file on the server
            FileUtility.mkdir(this.path + activeFolder);
            const filePath = this.path + activeFolder + this.getTimeStamp() + "_" + fileName;
            const writer = fs.createWriteStream(filePath);

            await this.telegram.sendMessage(chatId, `Start download file ${fileName}  \n\n${this.getTimeStamp()}`, this.mainMenu);

            FileUtility.download(fileLink, writer,
                this.onDownloadSuccess.bind(this, chatId, fileName),
                this.onDownloadError.bind(this, chatId, filePath)
            );
        } catch (err) {
            await this.telegram.sendMessage(chatId, 'An error occurred while retrieving the file link.', this.mainMenu);
            await this.downloadFinish();
            console.error(err);
        }
    }

    async onDownloadSuccess(chatId: string, fileName: string) {
        await this.downloadFinish();
        await this.telegram.sendMessage(chatId, `File successfully saved: ${fileName} \n\n Queued links: ${this.links.length} \n\n${this.getTimeStamp()}`, this.mainMenu);
    }

    async onDownloadError(chatId: string, filePath: string) {
        fs.unlinkSync(filePath);
        await this.downloadFinish();
        await this.telegram.sendMessage(chatId, 'An error occurred while downloading the file.\n\n File: ' + basename(filePath), this.mainMenu);
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

    private isUrl(s: string) {
        const regexp = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@\-\/]))?/;
        return regexp.test(s);
    }

}
