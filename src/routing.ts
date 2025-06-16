import { Elysia, file, type HTTPHeaders } from "elysia";
import MediaFileManager from "./data/MediaFileManager";
import { type MetaData } from "./data/MetaDataDB"
import { type IMediaFile } from "./data/MediaFile"
import type { BunFile } from "bun";

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
    console.error(`${status} ${message}`, error);
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
): BunFile | { error: string; status:number, details?: string } {

    const { set, query, headers } = context
    const { id } = query
    const item = manager.getFile(parseInt(id??"-1"))
    if (!item) {
        return handleError(set, `Not Found (id=${id})`, undefined, 404)
    }

    try {
        const file = Bun.file(item.path)
        set.headers["Content-Type"] = mimeType(item)
        if(mediaType(item)==="p") {
            return file
        }

        const fileSize = file.size
        set.headers["Accept-Ranges"] = "bytes"

        const rangeHeader = headers["range"]
        if (!rangeHeader) {
            set.headers["Content-Length"] = fileSize.toString()
            return file
        }

        const range = rangeHeader.replace("bytes=", "").split("-")
        const start = range[0] ? parseInt(range[0]) : NaN
        const end = range[1] ? parseInt(range[1]) : fileSize - 1

        if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
            return handleError(set, "Invalid range", undefined, 416)
        }

        const chunkSize = end - start + 1
        set.headers["Content-Range"] = `bytes ${start}-${end}/${fileSize}`
        set.headers["Content-Length"] = chunkSize.toString()
        set.status = 206

        return file.slice(start, end + 1)
    } catch (error) {
        return handleError(set, "Failed to read video file", error)
    }
}

export function booSetup(app:Elysia):Elysia {
    return app
    .get("/nop", ()=> {
        return { cmd: "nop" }
    })
    .get("/capability", () => {
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
            video = f.includes("v")
            audio = f.includes("a")
            photo = f.includes("p")
        } else if (type) {
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
        return getItem(context)
    })
    .get("/photo", (content) => {
        return getItem(content)
    })
    .get("/video", (content) => {
        return getItem(content)
    })
    .get("/audio", (content) => {
        return getItem(content)
    })
    .get("/chapter", ({query})=>{
        return {
            cmd:"chapter",
            id:query.id,
            chapters:[]
        }
    })
    .get("/current", ({query})=>{
        return {
            cmd: "current",
            id:1
        }
    })
    .put("/current", ()=>{
        return {
            cmd: "current"
        }
    })
    .get("/categories", ()=> {
        return {
            cmd: "categories",
            unchecked: "Unchecked",
            categories: [...new Set(manager.allFiles().map(it=>it.category))]
        }
    })
}
