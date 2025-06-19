import { EventEmitter } from "events";
import MediaFile from "./MediaFile"
import MediaSource, { type IFileEvent, type IFileRenameEvent } from "./MediaSource";
import MetaDataDB, { type MetaData } from "./MetaDataDB";
import target from "../../private/target"
import { logger } from "../Logger";

export interface SourceConfig {
    path: string;
    name: string;
    recursive: boolean;
    rawData?: {
        path: string;
        recursive: boolean;
    } | undefined;
}

export default class MediaFileManager extends EventEmitter {
    private sources: MediaSource[] = [];
    private db: MetaDataDB;
    public lastUpdated: Date = new Date()

    constructor() {
        super();
        this.db = new MetaDataDB();
    }

    /**
     * 設定からMediaFileManagerのインスタンスを作成
     */
    public static async create(): Promise<MediaFileManager> {
        const manager = new MediaFileManager();
        await manager.initialize();
        return manager;
    }


    /**
     * 初期化処理
     */
    private async initialize(): Promise<void> {
        // 既存のDBレコードを取得
        const existingRecords = await this.db.getAll();
        const existingPaths = new Set(existingRecords.map((record: { path: string }) => record.path));

        // ソースの初期化
        for (const sourceConfig of target.sources) {
            const source = new MediaSource(sourceConfig)

            // ファイル変更イベントのハンドラを設定
            source.on("change", this.handleFileChanged.bind(this));

            await source.scan();
            this.sources.push(source);

            // スキャンしたファイルのパスを記録
            const files = source.getFiles();
            for (const file of files) {
                if (existingPaths.has(file.path)) {
                    // 既存のレコードは処理済みとしてマーク
                    existingPaths.delete(file.path);
                } else {
                    // DBに存在しないファイルを追加
                    await this.handleFileCreated(file);
                }
            }
        }

        // DBにしか存在しないレコードを削除
        for (const path of existingPaths) {
            await this.db.delete(path);
        }

        this.lastUpdated = new Date()
        this.startWatching()
        logger.info("MediaFileManager started.")
    }

    private async handleFileChanged(event:IFileEvent): Promise<void> {
        logger.info(`MediaFileManager: file changed: ${event.changeType} - ${event.file.path}`);
        switch(event.changeType) {
            case "Changed":
            case "Created":
                await this.handleFileCreated(event.file)
                break
            case "Deleted":
                await this.handleFileDeleted(event.file)
                break;
            case "Renamed":
                await this.handleFileRenamed(event.file, (event as IFileRenameEvent).oldFullPath)
                break;
            default:
                logger.error(`unsupported event: ${event.changeType}`)
                break;
        }
    }

    /**
     * ファイル追加イベントのハンドラ
     */
    private async handleFileCreated(file: MediaFile): Promise<void> {
        logger.info(`MediaFileManager.handleFileCreated: ${file.path}`);
        this.db.upsert({
            path: file.path,
            ext: file.ext,
            title: file.title,
            category: file.category,
            length: file.length,
            date: file.date,
            duration: file.duration ?? 0,

            label: "",
            description: "",
            mark: 0,
            rating: 0,
            flag: 0,
            option: ""
        });
        this.lastUpdated = new Date()
    }

    /**
     * ファイル削除イベントのハンドラ
     */
    private async handleFileDeleted(file: MediaFile): Promise<void> {
        logger.info(`MediaFileManager.handleFileDeleted: ${file.path}`);
        this.db.delete(file.path);
    }

    /**
     * ファイルがリネームされたときのハンドラ
     */
    private async handleFileRenamed(file: MediaFile, oldPath:string): Promise<void> {
        try {
            // メタデータを更新
            this.db.updatePath(oldPath, file.path);
            logger.info(`MediaFileManager.handleFileRenamed: ${file.path}`);
        } catch (error) {
            logger.error(`ファイルのリネーム処理に失敗: ${file.path}`, error);
        }
    }

    /**
     * すべてのソースの監視を開始
     */
    public startWatching(): void {
        for (const source of this.sources) {
            source.startWatching();
        }
    }

    /**
     * すべてのソースの監視を停止
     */
    public stopWatching(): void {
        for (const source of this.sources) {
            source.stopWatching();
        }
    }

    /**
     * すべてのソースのファイルリストを取得
     */
    public allFiles(): MetaData[] {
        return this.db.getAll()
    }

    public getFile(id:number): MetaData|undefined {
        return this.db.getById(id)
        
    }
    // public getAllFiles(): MediaFile[] {
    //     return this.sources.flatMap(source => source.getFiles());
    // }

    // /**
    //  * 特定のソースのファイルリストを取得
    //  */
    // public getFilesBySource(path: string): MediaFile[] {
    //     const source = this.sources.find(s => s.getPath() === path);
    //     return source ? source.getFiles() : [];
    // }
}
