import { readdir, stat } from "fs/promises";
import { logger } from "../Logger";

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
                const fullPath = join(path, entry.name);
                const relativePath = relative(this.basePath, fullPath);

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
     * 別のファイルリストと比較
     */
    public compare(dist: ComparableFileList): { onlyInSrc: string[], onlyInDst: string[] } {
        const onlyInSrc: string[] = [];
        const onlyInDst: string[] = [];

        // このリストにのみ存在するファイル
        for (const file of this.files) {
            if (!dist.files.has(file)) {
                onlyInSrc.push(join(this.basePath, file));
            }
        }

        // 比較対象のリストにのみ存在するファイル
        for (const file of dist.files) {
            if (!this.files.has(file)) {
                onlyInDst.push(join(dist.basePath, file));
            }
        }

        return { onlyInSrc, onlyInDst };
    }

    /**
     * ファイルリストを取得
     */
    public getFiles(): string[] {
        return Array.from(this.files).map(it=>join(this.basePath, it));
    }
} 