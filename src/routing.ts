import { Elysia, file, type HTTPHeaders } from "elysia";
import MediaFileManager from "./data/MediaFileManager";
import { type MetaData } from "./data/MetaDataDB"
import { type IMediaFile } from "./data/MediaFile"
import type { BunFile } from "bun";
import { logger } from "./Logger";

// 設定

// MediaFileManagerのインスタンスを作成
const manager = await MediaFileManager.create();

function mediaType(f:IMediaFile) : string {
    switch(f.ext) {
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

function booType(f:IMediaFile):string {
    return f.ext.startsWith(".") ? f.ext.substring(1) : f.ext
}


function handleError(
    set: { status?: number | string },
    message: string,
    error: unknown|undefined = undefined,
    status: number = 500,
): { error: string; status:number, details?: string } {
    logger.error(`${status} ${message}`, error);
    set.status = status;
    const details = error instanceof Error ? error.message : error ? String(error) : undefined
    return {
        error: message,
        status,
        details
    };
};

function mimeType(f:IMediaFile):string {
    switch(f.ext) {
        case ".mp3": return "audio/mpeg"
        case ".mp4": return "video/mp4"
        case ".jpg":
        case ".jpeg": return "image/jpeg"
        case ".png": return "image/png"
        default: return "video/mp4"
    }
}

function getItem(
    context: {
        set: { status?: number|string, headers:HTTPHeaders },
        query: Record<string,string>,
        headers: Record<string,string|undefined>,
    }
): BunFile | Response | { error: string; status:number, details?: string } {

    const { set, query, headers } = context
    const { id } = query
    const item = manager.getFile(parseInt(id??"-1"))
    if (!item) {
        return handleError(set, `Not Found (id=${id})`, undefined, 404)
    }

    logger.debug(`GET ITEM: ${item.path} (id=${id})`)
    try {
        const file = Bun.file(item.path)
        const fileSize = file.size
        if(mediaType(item)==="p") {
            return file
        }

        // set.header("Accept-Ranges", "bytes")
        // set.headers["Connection"] = "keep-alive"

        const rangeHeader = headers["range"]
        if (!rangeHeader) {
            // set.headers["Content-Length"] = fileSize.toString()
            // return file
            return new Response(file, {
                headers: {
                    "Content-Type": mimeType(item),
                    "Accept-Ranges": "bytes",
                    "Connection": "keep-alive",
                    "Content-Length": fileSize.toString()
                }
            })
        }

        const range = rangeHeader.replace("bytes=", "").split("-")
        const start = range[0] ? parseInt(range[0]) : NaN
        const end = range[1] ? parseInt(range[1]) : fileSize - 1

        if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
            return handleError(set, "Invalid range", undefined, 416)
        }

        const chunkSize = end - start + 1
        const rangeValue = `bytes ${start}-${end}/${fileSize}`
        // set.headers["Content-Range"] = rangeValue
        // set.headers["Content-Length"] = chunkSize.toString()
        // set.status = 206

        // return file.slice(start, end + 1)
        return new Response(file.slice(start, end + 1), {
        status: 206,
        headers: {
            "Content-Type": mimeType(item),
            "Accept-Ranges": "bytes",
            "Connection": "keep-alive",
            "Content-Range": rangeValue,
            "Content-Length": chunkSize.toString()
        }
    })
    } catch (error) {
        return handleError(set, "Failed to read video file", error)
    }
}

export function booSetup(app:Elysia):Elysia {
    return app
    .get("/nop", ()=> {
        logger.debug("NOP")
        return { cmd: "nop" }
    })
    .get("/capability", () => {
        logger.debug("CAPABILITY")
        return {
            cmd: "capability",
            serverName: "BooServer",
            version:2,
            root: '/',
            category:true,
            rating:false,
            mark:false,
            chapter:false,
            reputation: 0,
            diff: true,
            sync: false,
            acceptRequest:false,
            hasView:false,
            authentication:false,
            types: "vap",   // video, audio, photo
        }
    })
    .get("/check", ({ query }) => {
        const { date } = query
        const dn = parseInt(date??"0")
        const update = (manager.lastUpdated.getTime()>dn) ? "1" : "0"
        logger.debug(`CHECK ${dn} : ${update}`)
        return {
            cmd: "check",
            update,
            status: "ok"
        }
    })
    .get("/list", ({set, query}) => {
        const { type, c, f } = query 
        let video = true
        let audio = true
        let photo = true
        if(f) {
            logger.debug(`LIST f=${f} c=${String(c)}`)
            video = f.includes("v")
            audio = f.includes("a")
            photo = f.includes("p")
        } else if (type) {
            logger.debug(`LIST f=${type} c=${String(c)}`)
            video = type === "video" || type === "all"
            audio = type === "audio" || type === "all"
            photo = type === "photo" || type === "all"
        }
        function filter(file:MetaData):boolean {
            if(c && file.category !== c) {
                return false
            }
            const mt = mediaType(file)
            if(video && mt==='v') return true
            if(audio && mt==='a') return true
            if(photo && mt==='p') return true
            return false
        }
        


        try {
            return {
                cmd: "list",
                date: manager.lastUpdated.getTime(),
                list: manager.allFiles().filter(it=>filter(it)).map((v) => {
                    return {
                        id: `${v.id}`,
                        name: v.title,
                        start: 0,
                        end: 0,
                        volume: 0.5,
                        type: booType(v),
                        media: mediaType(v),
                        size: v.length,
                        duration: v.duration?.toFixed() ?? 0,
                    }
                })
            }
        } catch (error) {
            return handleError(set, "cmd=list", error)
        }
    
    })
    .get("/item", (context) => {
        // logger.info("ITEM")
        return getItem(context)
    })
    .get("/photo", (content) => {
        // logger.info("PHOTO")
        return getItem(content)
    })
    .get("/video", (content) => {
        // logger.info("VIDEO")
        return getItem(content)
    })
    .get("/audio", (content) => {
        // logger.info("AUDIO")
        return getItem(content)
    })
    .get("/chapter", ({query})=>{
        logger.warn("CHAPTER: not supported.")
        return {
            cmd:"chapter",
            id:query.id,
            chapters:[]
        }
    })
    .get("/current", ({query})=>{
        logger.warn("CURRENT: not supported.")
        return {
            cmd: "current",
            id:1
        }
    })
    .put("/current", ()=>{
        logger.warn("CURRENT (PUT): not supported.")
        return {
            cmd: "current"
        }
    })
    .get("/categories", ()=> {
        logger.info("CATEGORIES")
        // const categories = new Set(manager.allFiles().map(it=>it.category))
        return {
            cmd: "categories",
            unchecked: "Unchecked",
            categories: [...new Set(manager.allFiles().map(it=>it.category))]
        }
    })
    .get("/pw/auth/*", ({set})=>{
        set.status = 404
        return "NOT_FOUND"
    })
    .get("favicon.ico", () => {
        return Bun.file("private/favicon.ico")
    })
}

export function booShutdown() {
    manager.stopWatching()
}