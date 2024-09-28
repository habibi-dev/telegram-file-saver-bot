import TelegramBot, {Message} from "node-telegram-bot-api";
import {chunk, get, isEmpty, trim} from "lodash";
import * as fs from "node:fs";
import {FileUtility} from "../utility/FileUtility";
import {basename} from "node:path";

export class TelegramMessageController {
    telegram: TelegramBot;
    path: string;
    folders: string[] = [];
    links: {
        link: string | TelegramBot.Document | TelegramBot.Voice | TelegramBot.PhotoSize,
        chatID: TelegramBot.ChatId,
        activeFolder: string
    }[] = [];
    downloadQueueActive: boolean = false;
    activeFolder: string = "/";
    mainMenu = null;

    constructor() {
        this.path = get(process, "env.SAVE_PATH", "./files") + "/";
        this.folders = get(process, "env.FOLDERS", "").split(",");
        this.activeFolder = "/" + get(process, "env.DEFAULT_FOLDER", "") + "/";
        const token = get(process, "env.YOUR_BOT_TOKEN", "") as string;

        if (!isEmpty(this.folders)) {
            this.mainMenu = {
                reply_markup: {
                    keyboard: chunk(this.folders.map(folder => ({text: folder})), 3),
                    resize_keyboard: true,
                    one_time_keyboard: true,
                }
            };
        }

        this.telegram = new TelegramBot(token, {polling: true});
        this.telegram.on("message", (message) => this.handleMessage(message));
    }

    async handleMessage(message: TelegramBot.Message) {
        const allowedUsername = get(process, "env.YOUR_USERNAME", "");
        const chatId = message.chat.id;
        const chatText = get(message, "text", "");
        const username = get(message, "from.username", "");

        if (!allowedUsername.split(",").includes(username)) {
            await this.telegram.sendMessage(chatId, 'You are not authorized to send files to this bot.');
            return;
        }

        if (this.folders.includes(chatText)) {
            this.activeFolder = `/${chatText}/`;
            return this.telegram.sendMessage(chatId, `Default folder changed to ${chatText}`, this.mainMenu);
        }

        if (chatText.match(/\/start/)) {
            return this.welcomeMessage(message);
        }

        const file = message.document || message.audio || message.video || message.voice || (message.photo ? message.photo[message.photo.length - 1] : null);

        if (file) {
            return this.addToDownload(file, chatId);
        }

        const links = chatText.split(",");
        if (links.every(link => this.isUrl(link))) {
            for (const link of links) {
                await this.addToDownload(link, chatId);
            }
        } else {
            await this.telegram.sendMessage(chatId, 'Please send a valid file or link.', this.mainMenu);
        }
    }

    private async addToDownload(link: any, chatID: number) {
        this.links.push({link: this.isUrl(link) ? trim(link) : link, chatID, activeFolder: this.activeFolder});
        await this.telegram.sendMessage(chatID, `Link added to the download queue. Queued links: ${this.links.length}`, this.mainMenu);

        if (!this.downloadQueueActive) {
            this.processDownloadQueue();
        }
    }

    private async processDownloadQueue() {
        if (this.downloadQueueActive || this.links.length === 0) return;
        this.downloadQueueActive = true;

        const item = this.links.shift();
        if (!item) return;

        const {link, chatID, activeFolder} = item;

        await this.telegram.sendMessage(chatID, `Starting download... \nRemaining files in queue: ${this.links.length}`, this.mainMenu);

        if (this.isUrl(link.toString())) {
            await this.downloadLink(link.toString(), chatID, activeFolder);
        } else {
            await this.downloadFile(link as TelegramBot.Document | TelegramBot.Voice | TelegramBot.PhotoSize, chatID, activeFolder);
        }

        const delay = parseInt(get(process, "env.DELAY_FOR_DOWNLOAD", "0"));
        await new Promise(resolve => setTimeout(resolve, delay));

        this.downloadQueueActive = false;
        if (this.links.length > 0) {
            await this.processDownloadQueue();
        }
    }


    private async downloadLink(link: string, chatId: TelegramBot.ChatId, activeFolder: string) {
        const allowedExtensions = get(process, "env.ALLOWED_EXTENSIONS", "").split(",");
        const url = new URL(link);
        const fileName = FileUtility.sanitizeFileName(decodeURIComponent(url.pathname.split("/").pop() || ""));
        const fileExtension = fileName.split('.').pop()?.toLowerCase();

        if (!allowedExtensions.includes(fileExtension || "")) {
            await this.telegram.sendMessage(chatId, `Files with .${fileExtension} extension are not allowed.`, this.mainMenu);
            return this.processDownloadQueue();
        }

        try {
            FileUtility.mkdir(this.path + activeFolder);
            const filePath = this.path + activeFolder + this.getTimeStamp() + "_" + fileName;
            const writer = fs.createWriteStream(filePath);

            await this.telegram.sendMessage(chatId, `Downloading file: ${fileName}`, this.mainMenu);

            FileUtility.download(url.href, writer,
                this.onDownloadSuccess.bind(this, chatId, fileName),
                this.onDownloadError.bind(this, chatId, filePath)
            );
        } catch (err) {
            console.error(err);
            await this.telegram.sendMessage(chatId, 'Error during download.', this.mainMenu);
        } finally {
            await this.processDownloadQueue();
        }
    }

    private async downloadFile(file: TelegramBot.Document | TelegramBot.Voice | TelegramBot.PhotoSize, chatId: TelegramBot.ChatId, activeFolder: string) {
        const allowedExtensions = get(process, "env.ALLOWED_EXTENSIONS", "").split(",");
        const fileId = get(file, "file_id", "");
        const fileName = FileUtility.sanitizeFileName(get(file, "file_name", `file_${fileId}`));
        const fileExtension = fileName.split('.').pop()?.toLowerCase();

        if (!allowedExtensions.includes(fileExtension || "")) {
            await this.telegram.sendMessage(chatId, `Files with .${fileExtension} extension are not allowed.`, this.mainMenu);
            return this.processDownloadQueue();
        }

        try {
            const fileLink = await this.telegram.getFileLink(fileId);
            FileUtility.mkdir(this.path + activeFolder);
            const filePath = this.path + activeFolder + this.getTimeStamp() + "_" + fileName;
            const writer = fs.createWriteStream(filePath);

            await this.telegram.sendMessage(chatId, `Downloading file: ${fileName}`, this.mainMenu);

            FileUtility.download(fileLink, writer,
                this.onDownloadSuccess.bind(this, chatId, fileName),
                this.onDownloadError.bind(this, chatId, filePath)
            );
        } catch (err) {
            console.error(err);
            await this.telegram.sendMessage(chatId, 'Error during download.', this.mainMenu);
        } finally {
            await this.processDownloadQueue();
        }
    }

    async onDownloadSuccess(chatId: number, fileName: string) {
        await this.telegram.sendMessage(chatId, `File saved successfully: ${fileName}`, this.mainMenu);
        await this.processDownloadQueue();
    }

    async onDownloadError(chatId: number, filePath: string) {
        fs.unlinkSync(filePath);
        await this.telegram.sendMessage(chatId, `Error during download: ${basename(filePath)}`, this.mainMenu);
        await this.processDownloadQueue();
    }

    private getTimeStamp() {
        const now = new Date();
        return now.toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}/, '');
    }

    private isUrl(link: string) {
        const regexp = /(ftp|http|https):\/\/(\S+)/;
        return regexp.test(link);
    }

    private welcomeMessage(msg: Message): void {
        this.telegram.sendMessage(msg.chat.id, 'Welcome to the folder manager bot!', this.mainMenu);
    }
}
