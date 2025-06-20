import { readdir, stat } from "fs/promises";
import { logger } from "../Logger";
import { join_path, relative_path } from "../utils/PathUtils";

export default class ComparableFileList {
    private basePath: string;
    private files: Set<string>;

    constructor(basePath: string) {
        this.basePath = basePath;
        this.files = new Set();
    }

    /**
     * パス内のファイルを列挙
     */
    public static async create(path: string, recursive: boolean): Promise<ComparableFileList> {
        const list = new ComparableFileList(path);
        await list.scan(path, recursive);
        return list;
    }

    /**
     * 再帰的にファイルをスキャン
     */
    private async scan(path: string, recursive: boolean): Promise<void> {
        try {
            const entries = await readdir(path, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join_path(path, entry.name);
                const relativePath = relative_path(this.basePath, fullPath);

                if (entry.isFile()) {
                    this.files.add(relativePath);
                } else if (recursive && entry.isDirectory()) {
                    await this.scan(fullPath, recursive);
                }
            }
        } catch (error) {
            logger.error(`スキャン中にエラーが発生: ${path}`, error);
            throw error;
        }
    }

    /**
     * ファイルリストから特定のファイルを削除
     */
    public remove(filePath: string): boolean {
        const relativePath = relative_path(this.basePath, filePath)
        if (this.files.has(relativePath)) {
            this.files.delete(relativePath)
            return true
        } else {
            return false
        }
    }

    /**
     * 別のファイルリストと比較
     */
    public compare(dist: ComparableFileList): { onlyInSrc: string[], onlyInDst: string[] } {
        const onlyInSrc: string[] = [];
        const onlyInDst: string[] = [];

        // このリストにのみ存在するファイル
        for (const file of this.files) {
            if (!dist.files.has(file)) {
                onlyInSrc.push(join_path(this.basePath, file));
            }
        }

        // 比較対象のリストにのみ存在するファイル
        for (const file of dist.files) {
            if (!this.files.has(file)) {
                onlyInDst.push(join_path(dist.basePath, file));
            }
        }

        return { onlyInSrc, onlyInDst };
    }

    /**
     * ファイルリストを取得
     */
    public getFiles(): string[] {
        return Array.from(this.files).map(it=>join_path(this.basePath, it));
    }
} 