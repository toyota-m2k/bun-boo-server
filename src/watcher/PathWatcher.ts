import { EventEmitter } from "events";

export abstract class PathWatcher extends EventEmitter{
    constructor() { super()} 
    public abstract start(): Promise<void>;
    public abstract stop(): Promise<boolean>;
    public feedbackCreationError(path: string): void {}
}

export interface FileChangeEvent {
    changeType: "Created" | "Changed" | "Deleted" | "Renamed";
    name: string;
    fullPath: string;
}
export interface FileRenameEvent extends FileChangeEvent {
    oldName: string;
    oldFullPath: string;
}

