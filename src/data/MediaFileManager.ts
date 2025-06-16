import { EventEmitter } from "events";
import MediaFile from "./MediaFile"
import MediaSource from "./MediaSource";
import MetaDataDB, { type MetaData } from "./MetaDataDB";
import target from "../../private/target"

export interface CloudConfig {
    scanInterval: number;
}

export interface SourceConfig {
    path: string;
    name: string;
    recursive: boolean;
    cloud: boolean;
    rawData?: {
        path: string;
        cloud: boolean;
        recursive: boolean;
    };
}

export default class MediaFileManager extends EventEmitter {
    private sources: MediaSource[] = [];
    private cloudConfig: CloudConfig;
    private db: MetaDataDB;
    public lastUpdated: Date = new Date()

    constructor(cloudConfig: CloudConfig) {
        super();
        this.cloudConfig = cloudConfig;
        this.db = new MetaDataDB();
    }

    /**
     * 設定からMediaFileManagerのインスタンスを作成
     */
    public static async create(): Promise<MediaFileManager> {
        const manager = new MediaFileManager(target.cloud);
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
            const source = new MediaSource(
                sourceConfig.path,
                sourceConfig.cloud,
                this.cloudConfig,
                sourceConfig.rawData
            );

            // ファイル変更イベントのハンドラを設定
            source.on("fileAdded", this.handleFileAdded.bind(this));
            source.on("fileRemoved", this.handleFileRemoved.bind(this));
            source.on("fileRenamed", this.handleFileRenamed.bind(this));

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
                    await this.handleFileAdded(file);
                }
            }
        }

        // DBにしか存在しないレコードを削除
        for (const path of existingPaths) {
            await this.db.delete(path);
        }

        this.lastUpdated = new Date()
        this.startWatching()
    }

    /**
     * ファイル追加イベントのハンドラ
     */
    private async handleFileAdded(file: MediaFile): Promise<void> {
        await this.db.upsert({
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
    private async handleFileRemoved(file: MediaFile): Promise<void> {
        await this.db.delete(file.path);
    }

    /**
     * ファイルがリネームされたときのハンドラ
     */
    private async handleFileRenamed(file: MediaFile): Promise<void> {
        try {
            // メタデータを更新
            await this.db.updatePath(file.path, file.path);
            console.log(`MediaFileManager: file renamed: ${file.path}`);
        } catch (error) {
            console.error(`ファイルのリネーム処理に失敗: ${file.path}`, error);
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
