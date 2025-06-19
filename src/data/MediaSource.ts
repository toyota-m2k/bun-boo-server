import { readdir, stat, copyFile, rename } from "fs/promises";
import { extname, basename } from "path";
import MediaFile from "./MediaFile";
import PathWatcher, { type FileChangeEvent, type FileRenameEvent } from "./PathWatcher";
import { EventEmitter } from "events";
import MediaConvert from "./MediaConvert";
import ComparableFileList from "./ComparableFileList";
import { logger } from "../Logger";
import type {SourceConfig} from "./MediaFileManager.ts";
import {dirname_path, join_path, normalize_path, relative_path} from "../utils/PathUtils.ts";

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
    private recursive: boolean;
    private files: Map<string, MediaFile>;
    private watcher: PathWatcher;
    private rawData?: RawDataConfig;
    private rawDataWatcher? : PathWatcher;
    private converter: MediaConvert;

    constructor(sourceConfig:SourceConfig) {
        super();
        this.path = normalize_path(sourceConfig.path)
        this.recursive = sourceConfig.recursive || false;
        this.rawData = sourceConfig.rawData
        this.files = new Map();
        this.watcher = new PathWatcher(this.path, this.recursive);
        this.converter = new MediaConvert();

        // ファイル変更イベントのハンドラを設定
        this.watcher.on("change", this.handleFileChange.bind(this));

        if (this.rawData) {
            this.rawDataWatcher = new PathWatcher(this.rawData.path, this.rawData.recursive);
            this.rawDataWatcher.on("change", this.handleRawDataFileChange.bind(this))
        }

    }

    /**
     * パスを取得
     */
    public getPath(): string {
        return this.path;
    }

    private async scanSub(parentDir:string, subDir: string|undefined, newFiles:Map<string,MediaFile>) : Promise<void> {
        try {
            const targetPath = subDir ? join_path(parentDir, subDir) : parentDir;
            const entries = await readdir(targetPath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isFile()) {
                    const fullPath = join_path(targetPath, entry.name);
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
                      subDir || "ROOT",
                      stats.size,
                      stats.mtime.getTime()
                    );
                    newFiles.set(fullPath, file);
                } else if (entry.isDirectory() && this.recursive) {
                    // サブディレクトリを再帰的にスキャン
                    await this.scanSub(targetPath, entry.name, newFiles);
                }
            }
        } catch (error) {
            logger.error(`サブディレクトリのスキャン中にエラーが発生: ${subDir}`, error);
        }
    }

    /**
     * ディレクトリをスキャンしてファイルリストを作成
     */
    public async scan(): Promise<void> {
        try {
            this.files.clear(); // 既存のファイルリストをクリア
            await this.scanSub(this.path, undefined, this.files)

            // rawDataが設定されている場合、初期ファイルリストの比較を行う
            if (this.rawData) {
                await this.processRawDataFiles()
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
            const currentList = await ComparableFileList.create(this.path, this.recursive);

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
                await this.watcher.start()
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
            const relativePath = relative_path(this.rawData.path, rawPath);

            const targetPath = join_path(this.path, relativePath);

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
                case "Changed":
                    const title = basename(event.fullPath, ext)
                    const stats = await stat(event.fullPath)
                    const old = this.files.get(event.fullPath)
                    var changeType = "Created"
                    if (old) {
                        // 既存のファイルがある
                        if (old.size === stats.size && old.date === stats.mtime.getTime()) {
                            // サイズと更新日時が同じなら何もしない
                            logger.debug(`MediaSource: unchanged file: ${event.fullPath}`);
                            return;
                        }
                        changeType = "Changed"
                    }

                    const dir = dirname_path(event.fullPath)
                    const category = ( dir == this.path ) ? "ROOT" : relative_path(this.path, dir);
                    logger.info(`MediaSource: created: ${event.fullPath}`)

                    file = await MediaFile.create(
                        event.fullPath,
                        ext,
                        title,
                        category,
                        stats.size,
                        stats.mtime.getTime()
                    )

                    this.files.set(event.fullPath, file);
                    this.emit("change", {...event, file, changeType})
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