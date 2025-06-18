import { readdir, stat, copyFile, rename } from "fs/promises";
import { existsSync } from "fs";
import { join, extname, basename } from "path";
import MediaFile from "./MediaFile";
import PathWatcher, { type FileChangeEvent, type FileRenameEvent } from "./PathWatcher";
import { EventEmitter } from "events";
import MediaConvert from "./MediaConvert";
import ComparableFileList from "./ComparableFileList";
import { logger } from "../Logger";

// 受け入れる拡張子のリスト
export const acceptableExtensions = ['.mp4', '.mp3', '.jpeg', '.jpg', '.png'] as const;

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
// export interface MediaSourceEvents {
//     'fileAdded': (file: MediaFile) => void;
//     'fileRemoved': (file: MediaFile) => void;
//     'fileRenamed': (file: MediaFile) => void;
// }

export interface IFileEvent {
    changeType: string,
    file: MediaFile
}
export interface IFileRenameEvent extends IFileEvent {
    oldFullPath: string;
}


export interface RawDataConfig {
    path: string;
    recursive: boolean;
}

export default class MediaSource extends EventEmitter {
    private path: string;
    private files: Map<string, MediaFile>;
    private watcher: PathWatcher;
    private rawData?: RawDataConfig;
    private rawDataWatcher? : PathWatcher;
    private converter: MediaConvert;

    constructor(path: string, rawData?: RawDataConfig) {
        super();
        this.path = path;
        this.rawData = rawData;
        this.files = new Map();
        this.watcher = new PathWatcher(path);
        this.converter = new MediaConvert();

        // ファイル変更イベントのハンドラを設定
        this.watcher.on("change", this.handleFileChange.bind(this));

        if (rawData) {
            this.rawDataWatcher = new PathWatcher(rawData.path)
            this.rawDataWatcher.on("change", this.handleRawDataFileChange.bind(this))

        }

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
                    
                    // 受け入れ可能な拡張子かチェック
                    if (!acceptableExtensions.includes(ext as typeof acceptableExtensions[number])) {
                        continue;
                    }

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
            logger.error(`スキャン中にエラーが発生: ${this.path}`, error);
            throw error;
        }
    }

    /**
     * rawDataのファイルを処理
     */
    private async processRawDataFiles(): Promise<void> {
        if (!this.rawData) return;

        // 監視を一時停止
        const stopped = await this.watcher.stop()

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
            logger.error(`rawDataの処理中にエラーが発生: ${this.rawData.path}`, error);
        } finally {
            if( stopped ) {
                // 停止している場合は監視を再開
                this.watcher.start()
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
                logger.debug(`MediaSource: already exists: ${targetPath}`)
                return;
            } catch {
                // ファイルが存在しない場合は続行
            }

            // 監視を一時停止
            const stopped = await this.watcher.stop()
            try {

                if (ext !== '.mp4' || !await this.converter.convert(rawPath, targetPath)) {
                    // 動画ファイル以外、または、コンバートしなかった場合はコピー
                    logger.info(`MediaSource: copied: ${targetPath}`)
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
                this.emit("change", {changeType: "Created", file});
                logger.info(`MediaSource file appended from rawData: ${targetPath}`)
            } finally {
                if( stopped) {
                    // 監視を再開
                    this.watcher.start()
                }
            }
        } catch (error) {
            logger.error(`ファイルの処理中にエラーが発生: ${rawPath}`, error);
        }
    }

    /**
     * ファイル変更イベントのハンドラ
     */
    private async handleFileChange(event: FileChangeEvent): Promise<void> {
        const ext = extname(event.fullPath).toLowerCase();
        // 受け入れ可能な拡張子かチェック
        if (!acceptableExtensions.includes(ext as typeof acceptableExtensions[number])) {
            return;
        }

        try {
            let file:MediaFile|undefined
            switch(event.changeType) {
                case "Created":
                    const title = basename(event.fullPath, ext);
                    const stats = await stat(event.fullPath);
                    logger.info(`MediaSource: created: ${event.fullPath}`)

                    file = await MediaFile.create(
                        event.fullPath,
                        ext,
                        title,
                        this.path,
                        stats.size,
                        stats.mtime.getTime()
                    );

                    this.files.set(event.fullPath, file);
                    this.emit("change", {file, ...event});
                    break;

                case "Deleted":
                    logger.info(`MediaSource: deleted: ${event.fullPath}`)
                    file = this.files.get(event.fullPath);
                    if (file) {
                        this.files.delete(event.fullPath);
                        this.emit("change", {file, ...event});
                    }
                    break;
                case "Renamed":
                    const renameEvent = event as FileRenameEvent
                    logger.info(`MediaSource: renamed: ${renameEvent.oldFullPath} -> ${renameEvent.name}`)
                    file = Array.from(this.files.values()).find(f => f.path === renameEvent.oldFullPath);
                    if (file) {
                        // 新しいパスを設定
                        file.path = renameEvent.fullPath
                        // ファイルマップを更新
                        this.files.delete(renameEvent.oldFullPath)
                        this.files.set(renameEvent.fullPath, file)
                        // イベントを発行
                        this.emit("change", {file, ...event});
                    }
                    break
                case "Changed":
                    // todo
                    // 動画なら duration を取得し直す。
                    logger.info(`MediaSource: changed: ${event.fullPath}`)
                    break
            }
        } catch(error) {
            logger.error("MediaSource#handleFileChange error", error);
        }
    }

    private async handleRawDataFileChange(event: FileChangeEvent):Promise<void> {
        const ext = extname(event.fullPath).toLowerCase();
        // 受け入れ可能な拡張子かチェック
        if (!acceptableExtensions.includes(ext as typeof acceptableExtensions[number])) {
            return;
        }

        try {
            let file:MediaFile|undefined
            switch(event.changeType) {
                case "Created":
                    logger.info(`MediaSource(rawData): created: ${event.fullPath}`)
                    this.processRawFile(event.fullPath)
                    break

                case "Deleted":
                    logger.info(`MediaSource(rawData): deleted: ${event.fullPath}`)
                    // nothing to do.
                    break;
                case "Renamed":
                    const renameEvent = event as FileRenameEvent
                    logger.info(`MediaSource(rawData): renamed: ${renameEvent.oldFullPath} -> ${renameEvent.name}`)
                    break
                case "Changed":
                    logger.info(`MediaSource(rawData): changed: ${event.fullPath}`)
                    // todo
                    // コピー（動画ならコンバート）
                    break
            }
        } catch(error) {
            logger.error("MediaSource#handleRawDataFileChange error", error);
        }

    }

    /**
     * ファイル監視を開始
     */
    public startWatching(): void {
        // 通常のパスの監視を開始
        this.watcher.start()

        // rawDataが設定されている場合、そのパスも監視
        this.rawDataWatcher?.start()
    }

    /**
     * ファイル監視を停止
     */
    public stopWatching(): void {
        this.watcher.stop()
        this.rawDataWatcher?.stop()
    }

    /**
     * ファイルリストを取得
     */
    public getFiles(): MediaFile[] {
        return Array.from(this.files.values());
    }
} 