import { readdir, stat, copyFile } from "fs/promises";
import { join, extname, basename } from "path";
import MediaFile from "./MediaFile";
import PathWatcher from "./PathWatcher";
import { type CloudConfig } from "./MediaFileManager";
import { EventEmitter } from "events";
import MediaConvert from "./MediaConvert";
import ComparableFileList from "./ComparableFileList";

// MediaSourceErrorクラスを追加
export class MediaSourceError extends Error {
    constructor(
        message: string,
        public readonly source: string,
        public readonly operation: string,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'MediaSourceError';
    }
}

// イベントの型定義
export interface MediaSourceEvents {
    'fileAdded': (file: MediaFile) => void;
    'fileRemoved': (file: MediaFile) => void;
    'fileRenamed': (file: MediaFile) => void;
}

export interface RawDataConfig {
    path: string;
    cloud: boolean;
    recursive: boolean;
}

export default class MediaSource extends EventEmitter {
    private path: string;
    private cloud: boolean;
    private files: Map<string, MediaFile>;
    private watcher: PathWatcher;
    private rawData?: RawDataConfig;
    private converter: MediaConvert;

    constructor(path: string, cloud: boolean = false, cloudConfig: CloudConfig, rawData?: RawDataConfig) {
        super();
        this.path = path;
        this.cloud = cloud;
        this.rawData = rawData;
        this.files = new Map();
        this.watcher = new PathWatcher(cloudConfig);
        this.converter = new MediaConvert();

        // ファイル変更イベントのハンドラを設定
        this.watcher.on("change", this.handleFileChange.bind(this));
    }

    /**
     * パスを取得
     */
    public getPath(): string {
        return this.path;
    }

    /**
     * ディレクトリをスキャンしてファイルリストを作成
     */
    public async scan(): Promise<void> {
        try {
            const entries = await readdir(this.path, { withFileTypes: true });
            const newFiles = new Map<string, MediaFile>();

            for (const entry of entries) {
                if (entry.isFile()) {
                    const fullPath = join(this.path, entry.name);
                    const ext = extname(entry.name).toLowerCase();
                    const title = basename(entry.name, ext);
                    const stats = await stat(fullPath);

                    const file = await MediaFile.create(
                        fullPath,
                        ext,
                        title,
                        this.path,
                        stats.size,
                        stats.mtime.getTime()
                    );

                    newFiles.set(fullPath, file);
                }
            }

            this.files = newFiles;

            // rawDataが設定されている場合、初期ファイルリストの比較を行う
            if (this.rawData) {
                await this.processRawDataFiles();
            }
        } catch (error) {
            console.error(`スキャン中にエラーが発生: ${this.path}`, error);
            throw error;
        }
    }

    /**
     * rawDataのファイルを処理
     */
    private async processRawDataFiles(): Promise<void> {
        if (!this.rawData) return;

        // 監視を一時停止
        const stopped = this.watcher.removePath(this.path);

        try {
            // rawDataのファイルリストを作成
            const rawList = await ComparableFileList.create(this.rawData.path, this.rawData.recursive);
            const currentList = await ComparableFileList.create(this.path, false);

            // ファイルリストを比較
            const { onlyInSrc } = rawList.compare(currentList);

            // rawDataにしか存在しないファイルを処理
            for (const rawPath of onlyInSrc) {
                await this.processRawFile(rawPath);
            }
        } catch (error) {
            console.error(`rawDataの処理中にエラーが発生: ${this.rawData.path}`, error);
        } finally {
            if( stopped ) {
                // 停止している場合は監視を再開
                this.watcher.addPath(this.path, {
                    recursive: false,
                    cloud: this.cloud,
                    startNow: true
                });
            }
        }
    }

    /**
     * rawDataのファイルを処理
     */
    private async processRawFile(rawPath: string): Promise<void> {
        if (!this.rawData) return;

        try {
            const ext = extname(rawPath).toLowerCase();
            const filename = basename(rawPath);
            const targetPath = join(this.path, filename);

            // 既に存在する場合はスキップ
            try {
                await stat(targetPath);
                console.log(`MediaSource: already exists: ${targetPath}`)
                return;
            } catch {
                // ファイルが存在しない場合は続行
            }

            if (ext !== '.mp4' || !await this.converter.convert(rawPath, targetPath)) {
                // 動画ファイル以外、または、コンバートしなかった場合はコピー
                console.log(`MediaSource: copied: ${targetPath}`)
                await copyFile(rawPath, targetPath);
            }

            // ファイルを追加
            const stats = await stat(targetPath);
            const file = await MediaFile.create(
                targetPath,
                ext,
                basename(filename, ext),
                this.path,
                stats.size,
                stats.mtime.getTime()
            );

            this.files.set(targetPath, file);
            this.emit("fileAdded", file);
            console.log(`MediaSource file appended from rawData: ${targetPath}`)
        } catch (error) {
            console.error(`ファイルの処理中にエラーが発生: ${rawPath}`, error);
        }
    }

    /**
     * ファイル変更イベントのハンドラ
     */
    private async handleFileChange(event: { path: string, type: string, source: string }): Promise<void> {
        // rawDataの変更イベントの場合
        if (this.rawData && event.source === this.rawData.path) {
            if (event.type === "add") {
                console.log(`MediaSource: append(rawData): ${event.path}`)
                await this.processRawFile(event.path);
            }
            return;
        }

        // 通常の変更イベントの場合
        if (event.source !== this.path) return;

        try {
            switch (event.type) {
                case "add": {
                    const ext = extname(event.path).toLowerCase();
                    const title = basename(event.path, ext);
                    const stats = await stat(event.path);
                    console.log(`MediaSource: added: ${event.path}`)

                    const file = await MediaFile.create(
                        event.path,
                        ext,
                        title,
                        this.path,
                        stats.size,
                        stats.mtime.getTime()
                    );

                    this.files.set(event.path, file);
                    this.emit("fileAdded", file);
                    break;
                }
                case "unlink": {
                    console.log(`MediaSource: removed: ${event.path}`)
                    const file = this.files.get(event.path);
                    if (file) {
                        this.files.delete(event.path);
                        this.emit("fileRemoved", file);
                    }
                    break;
                }
                case "rename": {
                    console.log(`MediaSource: renamed: ${event.path}`)
                    const file = Array.from(this.files.values()).find(f => f.path === event.path);
                    if (file) {
                        // 古いパスを保存
                        const oldPath = file.path;
                        // 新しいパスを設定
                        file.path = event.path;
                        // ファイルマップを更新
                        this.files.delete(oldPath);
                        this.files.set(event.path, file);
                        // イベントを発行
                        this.emit("fileRenamed", file);
                    }
                    break;
                }
            }
        } catch (error) {
            console.error(`ファイル変更処理中にエラーが発生: ${event.path}`, error);
        }
    }

    /**
     * ファイル監視を開始
     */
    public startWatching(): void {
        // 通常のパスの監視を開始
        this.watcher.addPath(this.path, {
            recursive: false,
            cloud: this.cloud,
            startNow: true
        });

        // rawDataが設定されている場合、そのパスも監視
        if (this.rawData) {
            this.watcher.addPath(this.rawData.path, {
                recursive: this.rawData.recursive,
                cloud: this.rawData.cloud,
                startNow: true
            });
        }
    }

    /**
     * ファイル監視を停止
     */
    public stopWatching(): void {
        this.watcher.removePath(this.path);
        if (this.rawData) {
            this.watcher.removePath(this.rawData.path);
        }
    }

    /**
     * ファイルリストを取得
     */
    public getFiles(): MediaFile[] {
        return Array.from(this.files.values());
    }
} 