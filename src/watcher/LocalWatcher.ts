import { logger } from "../Logger"
import { spawn } from "child_process";
import { existsSync } from "fs";
import {join} from "path";
import { PathWatcher, type FileChangeEvent, type FileRenameEvent } from "./PathWatcher";
import { t } from "elysia"

export default class LocalWatcher extends PathWatcher {
    private watcher: any = null
    private currentPath: string = ""
    private recursive: boolean = false
    private isWatching: boolean = false
    private killResolver: ((value: void | PromiseLike<void>) => void) | undefined = undefined

    constructor(path:string, recursive: boolean) {
        super()
        this.currentPath = path
        this.recursive = recursive
    }

    public async start(): Promise<void> {
        if (this.watcher != null) {
            await this.stop();
        }
        logger.info(`PathWatch: start: ${this.currentPath} (recursive: ${this.recursive})`);

        if (!existsSync(this.currentPath)) {
            throw new Error(`Directory does not exist: ${this.currentPath}`);
        }

        logger.info(`PathWatch: start: ${this.currentPath}`);
        await this.startWatch();
    }

    public async stop(): Promise<boolean> {
        if (!this.watcher) {
            return false;
        }

        logger.info(`PathWatch: stopping...: ${this.currentPath}`);
        this.isWatching = false;
        await new Promise<void>((resolve) => {
            this.killResolver = resolve;
            this.watcher.kill();
        })
        logger.info(`PathWatch: stopped: ${this.currentPath}`);
        return true
    }

    private async startWatch(): Promise<void> {
        try {
            const scriptPath = join(process.cwd(), "scripts", "FileWatcher.ps1");
            const args = [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                scriptPath,
                "-Path",
                this.currentPath
            ];
            if (this.recursive) {
                args.push("-Recursive");
            }

            this.watcher = spawn("powershell.exe", args);

            this.watcher.stdout.on("data", (data: Buffer) => {
                const eventText = data.toString();
                if(eventText.length===0) return

                try {
                    const events = eventText.split("\n");
                    for (const event of events) {
                        if (event.trim()) {
                            const eventData = JSON.parse(event);
                            logger.debug(`PathWatcher: ${event}`);

                            const changeEvent: FileChangeEvent = {
                                changeType: eventData.changeType,
                                name: eventData.name,
                                fullPath: eventData.fullPath.replace(/\\/g, "/")
                            };
                            if (eventData.changeType === "Renamed") {
                                const renameEvent: FileRenameEvent = {
                                    ...changeEvent,
                                    oldName: eventData.oldName,
                                    oldFullPath: eventData.oldFullPath.replace(/\\/g, "/")
                                };
                                this.emit("change", renameEvent);
                            } else {
                                this.emit("change", changeEvent);
                            }
                        }
                    }
                } catch (error) {
                    logger.error("イベント処理エラー:", error);
                }
            });

            this.watcher.stderr.on("data", (data: Buffer) => {
                logger.error(`Watcher error: ${data.toString()}`);
            });

            this.watcher.on("close", (code: number) => {
                logger.info(`Watcher process exited with code ${code}`);
                this.watcher = null;
                if (this.isWatching) {
                    logger.error(`Watcher stopped unexpectedly with code ${code}. Restarting...`)
                    this.startWatch().catch(err => {
                        logger.error("Watcher restart failed:", err);
                    });
                } else {
                    logger.info("Watcher stopped gracefully.");
                    if (this.killResolver) {
                        this.killResolver();
                        this.killResolver = undefined;
                    }
                }
            });
            this.isWatching = true;
        } catch (error) {
            logger.error("監視開始エラー:", error);
            throw error;
        }
    }
}
