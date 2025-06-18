import { EventEmitter } from "events";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { logger } from "../Logger";

export interface FileChangeEvent {
    changeType: "Created" | "Changed" | "Deleted" | "Renamed";
    name: string;
    fullPath: string;
}
export interface FileRenameEvent extends FileChangeEvent {
    oldName: string;
    oldFullPath: string;
}

export default class PathWatcher extends EventEmitter {
    private watcher: any = null;
    private isWatching: boolean = false;
    private currentPath: string = "";

    constructor(path:string) {
        super();
        this.currentPath = path
    }

    public async start(): Promise<void> {
        if (this.isWatching) {
            await this.stop();
        }


        if (!existsSync(this.currentPath)) {
            throw new Error(`Directory does not exist: ${this.currentPath}`);
        }

        logger.info(`PathWatch: start: ${this.currentPath}`);
        await this.startWatch();
    }

    public async stop(): Promise<boolean> {
        if (!this.isWatching) {
            return false;
        }

        logger.info(`PathWatch: stop: ${this.currentPath}`);
        if (this.watcher) {
            this.watcher.kill();
            this.watcher = null;
        }
        this.isWatching = false;
        this.currentPath = "";
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

            this.watcher = spawn("powershell.exe", args);

            this.watcher.stdout.on("data", (data: Buffer) => {
                const eventText = data.toString();
                if(eventText.length===0) return

                try {
                    const events = eventText.split("\n");
                    for (const event of events) {
                        if (event.trim()) {
                            const eventData = JSON.parse(event);
                            logger.debug(`受信イベント: ${event}`);
                            this.emit("change", eventData);
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
                this.isWatching = false;
                this.emit("error", new Error(`Watcher process exited with code ${code}`));
            });

            this.isWatching = true;
        } catch (error) {
            logger.error("監視開始エラー:", error);
            throw error;
        }
    }
}
