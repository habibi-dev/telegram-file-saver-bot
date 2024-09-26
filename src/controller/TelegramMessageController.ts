import TelegramBot, {Message} from "node-telegram-bot-api";
import {chunk, get, isArray, isEmpty} from "lodash";
import * as fs from "node:fs";
import {FileUtility} from "../utility/FileUtility";

export class TelegramMessageController {
    telegram: TelegramBot;
    path: string;
    folders = [];
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
        const allowedExtensions = get(process, "env.ALLOWED_EXTENSIONS", "").split(",");
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

        // if (chatText === "Back to main") {
        //     this.pending = false;
        //     return this.telegram.sendMessage(message.chat.id, "", this.mainMenu)
        // }

        // if (this.pending) return;


        if (chatText.match(/\/start/)) {
            return this.welcomeMessage(message);
        }

        // if (chatText.match(/🗂️ Create folder/)) {
        //     return this.createFolder(message);
        // }
        //
        // if (chatText.match(/📂 List folders/)) {
        //     return this.listFolders(message);
        // }

        // Check for different file types (document, audio, video, photo, etc.)
        const file = message.document || message.audio || message.video || message.voice ||
            (message.photo ? message.photo[message.photo.length - 1] : null); // The last photo is usually the highest resolution

        if (file) {
            return await this.downloadFile(file, chatId, allowedExtensions);
        }

        const links = chatText.split(",")

        if (!isArray(links) && this.isUrl(chatText)) {
            return await this.downloadLink(chatText, chatId);
        }

        if (isArray(links)) {
            for (const link of links) {
                if (this.isUrl(link)) {
                    await this.downloadLink(link, chatId);
                }
            }
            return;
        }


        return await this.telegram.sendMessage(chatId, 'Please send a file or link to this bot.', this.mainMenu);
    }

    private welcomeMessage(msg: Message): void {
        this.telegram.sendMessage(msg.chat.id, 'Welcome to the folder manager bot!', this.mainMenu);
    }

    /*private async createFolder(msg: Message) {
        this.pending = true;
        await this.telegram.sendMessage(msg.chat.id, 'Please enter the name of the folder you want to create:');

        this.telegram.once('message', (msg) => {
            this.pending = false;
            const folderName = msg.text.trim();
            const folderPath = path.join(this.path, folderName);

            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath);
                this.telegram.sendMessage(msg.chat.id, `✅ Folder ${folderName} Successfully created!`);
            } else {
                this.telegram.sendMessage(msg.chat.id, `⚠️ Folder ${folderName} It already existed.`);
            }
        });
    }*/

    /*private async listFolders(msg: Message) {
        fs.readdir(this.path, (err, files) => {
            if (err) {
                return this.telegram.sendMessage(msg.chat.id, '⚠️ Error in receiving the list of folders.', this.mainMenu);
            }

            if (files.length === 0) {
                return this.telegram.sendMessage(msg.chat.id, 'No folders available.', this.mainMenu);
            }

            const folders = []

            files.map((file) => folders.push({text: file}))

            this.pending = true;

            this.telegram.sendMessage(msg.chat.id, `📂List of folders:`, {
                reply_markup: {
                    keyboard: [...chunk(folders, 2), [{text: "Back to main"}]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });

            this.telegram.once('message', (msg) => {
                const chatText = get(msg, "text", "");
                this.folder = chatText;

                this.telegram.sendMessage(msg.chat.id, `📂 Folder management [ ${chatText} ]`, {
                    reply_markup: {
                        keyboard: [[{text: "Open"}, {text: "Rename"}, {text: "Delete"}], [{text: "Back to main"}]],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                });


                this.telegram.once("message", (msg) => {
                    const chatText = get(msg, "text", "");

                    if (chatText === "Back to main") return;

                    switch (chatText) {
                        case "Open":
                            const list = this.path.split("/");
                            list.push(chatText);
                            this.path = list.join("/").replace(/\/+/g, '\/');
                            return this.telegram.sendMessage(msg.chat.id, `Current route: ${this.path}`, this.mainMenu);
                    }

                })

            });
        });
    }*/

    private async downloadLink(link: string, chatId: TelegramBot.ChatId) {
        const allowedExtensions = get(process, "env.ALLOWED_EXTENSIONS", "").split(",");
        const url = new URL(link);
        const fileName = FileUtility.sanitizeFileName(decodeURIComponent((url.pathname.split("/").pop())));
        const fileExtension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';

        // Check if the file extension is allowed
        if (!allowedExtensions.includes(fileExtension)) {
            await this.telegram.sendMessage(chatId, `Files with the .${fileExtension} extension are not allowed. Only ${allowedExtensions.join(", ")} files are accepted.`, this.mainMenu);
            return;
        }

        try {
            // Download and save the file on the server
            FileUtility.mkdir(this.path + this.activeFolder);
            const filePath = this.path + this.activeFolder + this.getTimeStamp() + "_" + fileName;
            const writer = fs.createWriteStream(filePath);

            await this.telegram.sendMessage(chatId, `Start download file ${fileName}  \n\n${this.getTimeStamp()}`, this.mainMenu);

            FileUtility.download(url.href, writer,
                this.onDownloadSuccess.bind(this, chatId, fileName),
                this.onDownloadError.bind(this, chatId, filePath)
            );
        } catch (err) {
            await this.telegram.sendMessage(chatId, 'An error occurred while retrieving the file link.', this.mainMenu);
            console.error(err);
        }
    }

    private async downloadFile(file: TelegramBot.Document | TelegramBot.Voice | TelegramBot.PhotoSize, chatId: number, allowedExtensions: string[]) {
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
            await this.telegram.sendMessage(chatId, `Files with the .${fileExtension} extension are not allowed. Only ${allowedExtensions.join(", ")} files are accepted.`, this.mainMenu);
            return;
        }

        // Get the download link for the file
        try {
            const fileLink = await this.telegram.getFileLink(fileId);

            // Download and save the file on the server
            FileUtility.mkdir(this.path + this.activeFolder);
            const filePath = this.path + this.activeFolder + this.getTimeStamp() + "_" + fileName;
            const writer = fs.createWriteStream(filePath);

            await this.telegram.sendMessage(chatId, `Start download file ${fileName}  \n\n${this.getTimeStamp()}`, this.mainMenu);

            FileUtility.download(fileLink, writer,
                this.onDownloadSuccess.bind(this, chatId, fileName),
                this.onDownloadError.bind(this, chatId, filePath)
            );
        } catch (err) {
            await this.telegram.sendMessage(chatId, 'An error occurred while retrieving the file link.', this.mainMenu);
            console.error(err);
        }
    }

    async onDownloadSuccess(chatId: string, fileName: string) {
        await this.telegram.sendMessage(chatId, `File successfully saved: ${fileName} \n\n${this.getTimeStamp()}`, this.mainMenu);
    }

    async onDownloadError(chatId: string, filePath: string) {
        fs.unlinkSync(filePath);
        await this.telegram.sendMessage(chatId, 'An error occurred while downloading the file.', this.mainMenu);
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
        const regexp = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;
        return regexp.test(s);
    }

}
