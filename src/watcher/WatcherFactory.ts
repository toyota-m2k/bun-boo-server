import { PathWatcher } from "./PathWatcher";
import CloudWatcher from "./CloudWatcher";
import LocalWatcher from "./LocalWatcher";

export class WatcherFactory {
    public static create(path: string, recursive: boolean, cloud: boolean): PathWatcher {
        if (cloud) {
            return new CloudWatcher(path, recursive);
        } else {
            return new LocalWatcher(path, recursive);
        }
    }
}
