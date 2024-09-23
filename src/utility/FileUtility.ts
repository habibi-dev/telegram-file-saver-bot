import axios from "axios";
import fs from "node:fs";

export class FileUtility {

    static download(link: string, writer: fs.WriteStream, callbackSuccess = () => null, callbackError = () => null) {
        axios({
            url: link,
            method: 'GET',
            responseType: 'stream'
        }).then(response => {
            response.data.pipe(writer);
            writer.on('finish', callbackSuccess);
            writer.on('error', callbackError);
        }).catch(err => {
            callbackError();
            console.error(err);
        });
    }

    static mkdir(path: string) {
        fs.mkdir(path, {recursive: true}, (err) => {
            if (err) {
                console.error('Error creating directories:', err);
            }
        });
    }

    static async getFileMimeType(url: string): Promise<string | null> {
        const response = await fetch(url, {method: 'HEAD'});
        return response.headers.get('Content-Type');
    }

    static sanitizeFileName(fileName: string): string {
        let sanitized = fileName.replace(/[^a-zA-Z0-9.]/g, '-');

        sanitized = sanitized.replace(/-+/g, '-');

        sanitized = sanitized.replace(/^-+|-+$/g, '');

        return sanitized;
    }
}