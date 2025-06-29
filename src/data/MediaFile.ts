import { spawn } from "child_process";
import config from "../../private/config.ts"
import { logger } from "../Logger.ts";

export interface IMediaFile {
    path: string;
    ext: string;
    title: string;
    category: string;
    length: number;
    date: number;
    duration: number;
}

export default class MediaFile implements IMediaFile {
    public path:string
    public ext:string
    public title:string
    public category:string
    public length:number
    private _duration: number | null = null;
    public date:number
    constructor(path:string, ext:string, title:string, category:string, length:number,date:number) {
        this.path = path
        this.ext = ext
        this.length = length
        this.title = title
        this.date = date
        this.category = category
    }

    public mimeType():string {
        switch(this.ext) {
            case ".mp3": return "audio/mpeg"
            case ".mp4": return "video/mp4"
            case ".jpg":
            case ".jpeg": return "image/jpeg"
            case ".png": return "image/png"
            default: return "video/mp4"
        }
    }

    public booType():string {
        return this.ext.startsWith(".") ? this.ext.substring(1) : this.ext
    }

    get mediaType():string {
        switch(this.ext) {
            case ".mp3":
                return "a"
            case ".mp4":
                return "v"
            case ".jpg":
            case ".jpeg":
            case ".png":
                return "p"
            default: return "v"
        }
    }

    get duration(): number {
        return this._duration ?? 0;
    }

    async getDuration(): Promise<MediaFile> {
        if (this._duration !== null) {
            return this;
        }
        this._duration = await MediaFile.getDuration(this.path)
        return this
    }

    public static async create(path:string, ext:string, title:string, category:string, length:number,date:number):Promise<MediaFile> {
        const e = new MediaFile( path, ext, title, category, length, date)
        if( ext === ".mp4" || ext === ".mp3" ) {
            await e.getDuration()
        }
        return e;
    }

    public static async getDuration(path:string): Promise<number> {
        return new Promise((resolve, reject) => {
            const ffprobePath = config.ffprobe.path.replace(/\\/g, "/");
            const ffprobe = spawn(ffprobePath, [
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "json",
                path
            ]);

            let output = "";

            ffprobe.stdout.on("data", (data) => {
                output += data.toString();
            });

            ffprobe.stderr.on("data", (data) => {
                logger.error(`ffprobe stderr: ${data}`);
            });

            ffprobe.on("close", async (code) => {
                if (code !== 0) {
                    const msg = `ffprobe process exited with code ${code}`
                    logger.error(msg)
                    reject(new Error(msg))
                    return
                }

                try {
                    const result = JSON.parse(output);
                    const duration = parseFloat(result.format.duration);
                    logger.debug("ffprobe ok.")
                    resolve(duration)
                } catch (error) {
                    const msg = `Failed to parse ffprobe output: ${error}`
                    reject(new Error(msg));
                }
            });
        });
    }

}