import { readdir, stat, copyFile, rename } from "fs/promises";
import { extname, basename } from "path";
import MediaFile from "./MediaFile";
import { PathWatcher, type FileChangeEvent, type FileRenameEvent } from "../watcher/PathWatcher.ts";
import { WatcherFactory } from "../watcher/WatcherFactory.ts";
import { EventEmitter } from "events";
import MediaConvert from "./MediaConvert";
import ComparableFileList from "./ComparableFileList";
import { logger } from "../Logger";
import type {BaseSourceConfig, SourceConfig} from "./MediaFileManager.ts";
import {dirname_path, ensureDirectoryExists, join_path, normalize_path, relative_path} from "../utils/PathUtils.ts";

// 受け入れる拡張子のリスト
const acceptableExtensions = ['.mp4', '.mp3', '.jpeg', '.jpg', '.png'] as const;
// 型ガードを使用
export function isAcceptableExtension(ext: string): ext is typeof acceptableExtensions[number] {
  return (acceptableExtensions as readonly string[]).includes(ext);
}

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
    oldFullPath: string
}

export default class MediaSource extends EventEmitter {
    private path: string
    private name: string
    private recursive: boolean
    private cloud: boolean
    private files: Map<string, MediaFile>
    private watcher: PathWatcher
    private rawData?: BaseSourceConfig
    private rawDataWatcher? : PathWatcher
    private converter: MediaConvert

    constructor(sourceConfig:SourceConfig) {
        super();
        this.path = normalize_path(sourceConfig.path)
        this.name = sourceConfig.name || basename(this.path);
        this.recursive = sourceConfig.recursive || false;        this.cloud = sourceConfig.cloud || false;
        this.rawData = sourceConfig.rawData
        this.files = new Map();
        this.watcher = WatcherFactory.create(this.path, this.recursive, this.cloud);
        this.converter = new MediaConvert();

        // ファイル変更イベントのハンドラを設定
        this.watcher.on("change", this.handleFileChange.bind(this));

        if (this.rawData) {
            this.rawDataWatcher = WatcherFactory.create(this.rawData.path, this.rawData.recursive || false, this.rawData.cloud || false);
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
            const category = ( targetPath == this.path ) ? "ROOT" : relative_path(this.path, targetPath);

            for (const entry of entries) {
                if (entry.isFile()) {
                    const fullPath = join_path(targetPath, entry.name);
                    const ext = extname(entry.name).toLowerCase();

                    // 受け入れ可能な拡張子かチェック
                    if (!isAcceptableExtension(ext)) {
                        continue;
                    }

                    const title = basename(entry.name, ext);
                    const stats = await stat(fullPath);

                    try {
                        const file = await MediaFile.create(
                            fullPath,
                            ext,
                            title,
                            category,
                            stats.size,
                            stats.mtime.getTime()
                        );
                        newFiles.set(fullPath, file);
                    } catch (error) {
                        // ffprobeによるメタデータの取得に失敗した
                        logger.error(`MediaSource: failed to create MediaFile: ${fullPath}`, error);
                    }
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
            const rawList = await ComparableFileList.create(this.rawData.path, this.rawData.recursive===true);
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
            const dir = dirname_path(targetPath)
            const category = ( dir == this.path ) ? "ROOT" : relative_path(this.path, dir);

            // 既に存在する場合はスキップ
            try {
                await stat(targetPath);
                logger.debug(`MediaSource: already exists: ${targetPath}`)
                return;
            } catch {
                // ファイルが存在しない場合は続行
                await ensureDirectoryExists(dir);
            }

            if(ext === ".mp4"|| ext === ".mp3") {
                // rawData内のファイルが動画・音声として扱えることを確認
                try {
                    MediaFile.getDuration(rawPath)
                } catch (error) {
                    // まだコピー中とかダウンロード中などの状態でメタデータが取得できない可能性がある
                    this.rawDataWatcher?.feedbackCreationError(rawPath);
                    return
                }
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
                    basename(filename),
                    category,
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
        if (!isAcceptableExtension(ext)) {
            if (event.changeType === "Renamed" && isAcceptableExtension(extname((event as FileRenameEvent).oldFullPath))) {
                // 受け入れ可能な名前から、受け入れない名前に変更されたら Delete として扱う
                event = {
                    changeType: "Deleted",
                    name: basename((event as FileRenameEvent).oldFullPath),
                    fullPath: (event as FileRenameEvent).oldFullPath
                }
            } else {
                return
            }
        }

        try {
            let file:MediaFile|undefined
            switch(event.changeType) {
                case "Created":
                case "Changed":
                    const title = basename(event.fullPath)
                    const stats = await stat(event.fullPath)
                    const old = this.files.get(event.fullPath)
                    var changeType = "Created"
                    if (old) {
                        // 既存のファイルがある
                        if (old.length === stats.size && old.date === stats.mtime.getTime()) {
                            // サイズと更新日時が同じなら何もしない
                            logger.debug(`MediaSource: unchanged file: ${event.fullPath}`);
                            return;
                        }
                        changeType = "Changed"
                    }

                    const dir = dirname_path(event.fullPath)
                    const category = ( dir == this.path ) ? "ROOT" : relative_path(this.path, dir);
                    logger.info(`MediaSource: created: ${event.fullPath}`)

                    try {
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
                    } catch (error) {
                        // ffprobeによるメタデータの取得に失敗した
                        logger.error(`MediaSource: failed to create MediaFile: ${event.fullPath}`, error);
                        this.watcher.feedbackCreationError(event.fullPath);
                    }
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
                        file.title = basename(event.fullPath)
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