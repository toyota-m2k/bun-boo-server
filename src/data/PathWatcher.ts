import { EventEmitter } from "events";
import { watch } from "fs";
import { join } from "path";
import ComparableFileList from "./ComparableFileList";
import type { CloudConfig } from "./MediaFileManager";
import { existsSync } from "fs";

export interface WatchOptions {
    recursive: boolean;
    cloud: boolean;
    startNow: boolean;
}

export interface WatchEntry {
    path: string;
    options: WatchOptions;
    watcher?: ReturnType<typeof watch>;
    scanTimer?: NodeJS.Timeout;
    fileList?: ComparableFileList;
    isScanning: boolean;
}

export default class PathWatcher extends EventEmitter {
    private entries: Map<string, WatchEntry> = new Map();
    private cloudConfig: CloudConfig;

    constructor(cloudConfig: CloudConfig) {
        super();
        this.cloudConfig = cloudConfig;
    }

    /**
     * 監視パスを追加
     */
    public async addPath(path: string, options: WatchOptions): Promise<void> {
        if (this.entries.has(path)) {
            return
        }
        console.log(`PathWatcher: add: ${path} (cloud=${options.cloud ? "true":"false"})`)
        const entry: WatchEntry = { path, options, isScanning: false };

        // クラウドストレージの場合は初期ファイルリストを作成
        if (options.cloud) {
            entry.fileList = await ComparableFileList.create(path, options.recursive);
        }

        this.entries.set(path, entry);

        if (options.startNow) {
            this.start(path);
        }
    }

    /**
     * 監視パスを削除
     */
    public removePath(path: string): boolean {
        const entry = this.entries.get(path);
        if (!entry) {
            return false
        }
        console.log(`PathWatcher: remove: ${path}`)

        this.stop(path);
        this.entries.delete(path);
        return true
    }

    /**
     * すべての監視を開始
     */
    public startAll(): void {
        for (const [path] of this.entries) {
            this.start(path);
        }
    }

    /**
     * すべての監視を停止
     */
    public stopAll(): void {
        for (const [path] of this.entries) {
            this.stop(path);
        }
    }

    /**
     * 特定のパスの監視を停止
     */
    public stop(path: string): void {
        const entry = this.entries.get(path);
        if (!entry) {
            return
        }
        console.log(`PathWatch: stop: ${entry.path}`)

        if (entry.watcher) {
            entry.watcher.close();
            entry.watcher = undefined;
        }

        if (entry.scanTimer) {
            clearTimeout(entry.scanTimer);
            entry.scanTimer = undefined;
        }
    }

    /**
     * 特定のパスの監視を開始
     */
    public start(path: string): void {
        const entry = this.entries.get(path);
        if (!entry) {
            return
        }

        // 既存の監視を停止
        this.stop(path);

        if (entry.options.cloud) {
            // クラウドストレージの場合は定期的なスキャン
            this.startCloudWatch(entry);
        } else {
            // ローカルファイルの場合はfs.watchを使用
            this.startLocalWatch(entry);
        }
    }

    /**
     * ローカルファイルの監視を開始
     */
    private startLocalWatch(entry: WatchEntry): void {
        console.log(`PathWatch: start(local): ${entry.path}`)
        try {
            const watcher = watch(entry.path, { recursive: entry.options.recursive }, (eventType, filename) => {
                if (!filename) return;

                const fullPath = join(entry.path, filename);
                
                // リネームイベントの処理
                if (eventType === "rename") {
                    if (existsSync(fullPath)) {
                        // ファイルが存在する場合、これはリネーム後のパス
                        this.emit("change", {
                            path: fullPath,
                            type: "rename",
                            source: entry.path
                        });
                    } else {
                        // ファイルが存在しない場合、これは削除
                        this.emit("change", {
                            path: fullPath,
                            type: "unlink",
                            source: entry.path
                        });
                    }
                    return;
                }

                // その他のイベントの処理
                const type = eventType === "change" && !existsSync(fullPath)
                    ? "unlink"
                    : eventType;

                this.emit("change", {
                    path: fullPath,
                    type,
                    source: entry.path
                });
            });

            entry.watcher = watcher;
            console.log(`監視を開始: ${entry.path}`);
        } catch (error) {
            console.error(`監視の開始に失敗: ${entry.path}`, error);
            throw error;
        }
    }

    /**
     * クラウドストレージの監視を開始
     */
    private startCloudWatch(entry: WatchEntry): void {
        console.log(`PathWatch: start(cloud): ${entry.path}`)
        // 初回スキャン
        this.scanCloudPath(entry);

        // 定期的なスキャン（完了を待ってから次を実行）
        const scheduleNextScan = async () => {
            await this.scanCloudPath(entry);
            entry.scanTimer = setTimeout(scheduleNextScan, this.cloudConfig.scanInterval);
        };

        entry.scanTimer = setTimeout(scheduleNextScan, this.cloudConfig.scanInterval);
    }

    /**
     * クラウドストレージのパスをスキャン
     */
    private async scanCloudPath(entry: WatchEntry): Promise<void> {
        if (entry.isScanning) {
            return;
        }

        entry.isScanning = true;
        try {
            if (!entry.fileList) {
                throw new Error("ファイルリストが初期化されていません");
            }

            // 現在のファイルリストを作成
            const currentList = await ComparableFileList.create(entry.path, entry.options.recursive);

            // ファイルリストを比較
            const { onlyInSrc, onlyInDst } = entry.fileList.compare(currentList);

            // 削除されたファイルのイベントを発行
            for (const path of onlyInSrc) {
                this.emit("change", {
                    path,
                    type: "unlink",
                    source: entry.path
                });
            }

            // 追加されたファイルのイベントを発行
            for (const path of onlyInDst) {
                this.emit("change", {
                    path,
                    type: "add",
                    source: entry.path
                });
            }

            // ファイルリストを更新
            entry.fileList = currentList;

        } catch (error) {
            console.error(`スキャンに失敗: ${entry.path}`, error);
        } finally {
            entry.isScanning = false;
        }
    }
}
