import { Database } from "bun:sqlite";
import { join } from "path";
import { type IMediaFile } from "./MediaFile"

export interface MetaData extends IMediaFile {
    id?: number;
    path: string;
    ext: string;
    title: string;
    category: string;
    length: number;
    date: number;
    duration: number;
    label: string;
    description: string;
    mark: number;
    rating: number;
    flag: number;
    option: string;
}

export default class MetaDataDB {
    private db: Database;

    constructor(dbPath: string = "metadata.db") {
        // DBファイルのパスを設定
        const fullPath = join(process.cwd(), dbPath);
        this.db = new Database(fullPath);

        // パフォーマンス最適化のための設定
        this.db.run("PRAGMA journal_mode=WAL");
        this.db.run("PRAGMA synchronous=normal");

        // テーブルが存在しない場合は作成
        this.initialize();
    }

    /**
     * データベースの初期化
     */
    private initialize(): void {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                ext TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                length INTEGER NOT NULL,
                date INTEGER NOT NULL,
                duration INTEGER NOT NULL,
                label TEXT NOT NULL,
                description TEXT NOT NULL,
                mark INTEGER NOT NULL DEFAULT 0,
                rating INTEGER NOT NULL DEFAULT 0,
                flag INTEGER NOT NULL DEFAULT 0,
                option TEXT NOT NULL DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 更新日時を自動更新するトリガーを作成
        this.db.run(`
            CREATE TRIGGER IF NOT EXISTS update_metadata_timestamp 
            AFTER UPDATE ON metadata
            BEGIN
                UPDATE metadata SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
            END
        `);
    }

    /**
     * メタデータを追加または更新
     */
    public upsert(metadata: MetaData): void {
        const stmt = this.db.prepare(`
            INSERT INTO metadata (
                path, ext, title, category, length, date, duration,
                label, description, mark, rating, flag, option
            )
            VALUES (
                $path, $ext, $title, $category, $length, $date, $duration,
                $label, $description, $mark, $rating, $flag, $option
            )
            ON CONFLICT(path) DO UPDATE SET
                ext = $ext,
                title = $title,
                category = $category,
                length = $length,
                date = $date,
                duration = $duration,
                label = $label,
                description = $description,
                mark = $mark,
                rating = $rating,
                flag = $flag,
                option = $option
        `);

        stmt.run({
            $path: metadata.path,
            $ext: metadata.ext,
            $title: metadata.title,
            $category: metadata.category,
            $length: metadata.length,
            $date: metadata.date,
            $duration: metadata.duration,
            $label: metadata.label,
            $description: metadata.description,
            $mark: metadata.mark,
            $rating: metadata.rating,
            $flag: metadata.flag,
            $option: metadata.option
        });
    }

    public getAll(): MetaData[] {
        const stmt = this.db.prepare("SELECT * FROM metadata");
        return stmt.all() as MetaData[];
    }

    /**
     * パスを指定してメタデータを取得
     */
    public getByPath(path: string): MetaData | null {
        const stmt = this.db.prepare(`
            SELECT * FROM metadata WHERE path = $path
        `);

        const result = stmt.get({ $path: path });
        return result as MetaData | null;
    }

    /**
     * 複数のパスを指定してメタデータを一括取得
     */
    public getByPaths(paths: string[]): MetaData[] {
        const placeholders = paths.map(() => '?').join(',');
        const stmt = this.db.prepare(`
            SELECT * FROM metadata WHERE path IN (${placeholders})
        `);

        return stmt.all(...paths) as MetaData[];
    }

    /**
     * メタデータを削除
     */
    public delete(path: string): void {
        const stmt = this.db.prepare(`
            DELETE FROM metadata WHERE path = $path
        `);

        stmt.run({ $path: path });
    }

    /**
     * 複数のメタデータを一括削除
     */
    public deleteMany(paths: string[]): void {
        const placeholders = paths.map(() => '?').join(',');
        const stmt = this.db.prepare(`
            DELETE FROM metadata WHERE path IN (${placeholders})
        `);

        stmt.run(...paths);
    }

    /**
     * フラグでフィルタリングしてメタデータを取得
     */
    public getByFlag(flag: number): MetaData[] {
        const stmt = this.db.prepare(`
            SELECT * FROM metadata WHERE flag = $flag
        `);

        return stmt.all({ $flag: flag }) as MetaData[];
    }

    /**
     * レーティングでフィルタリングしてメタデータを取得
     */
    public getByRating(minRating: number): MetaData[] {
        const stmt = this.db.prepare(`
            SELECT * FROM metadata WHERE rating >= $rating
        `);

        return stmt.all({ $rating: minRating }) as MetaData[];
    }

    /**
     * ラベルで検索
     */
    public searchByLabel(label: string): MetaData[] {
        const stmt = this.db.prepare(`
            SELECT * FROM metadata WHERE label LIKE $label
        `);

        return stmt.all({ $label: `%${label}%` }) as MetaData[];
    }

    /**
     * IDを指定してメタデータを取得
     */
    public getById(id: number): MetaData | undefined {
        const stmt = this.db.prepare(`
            SELECT * FROM metadata WHERE id = $id
        `);

        const result = stmt.get({ $id: id });
        return result as MetaData | undefined;
    }

    /**
     * メタデータのパスを更新
     */
    public updatePath(oldPath: string, newPath: string): void {
        const stmt = this.db.prepare(`
            UPDATE metadata 
            SET path = $newPath
            WHERE path = $oldPath
        `);

        stmt.run({
            $oldPath: oldPath,
            $newPath: newPath
        });
    }

    /**
     * データベースを閉じる
     */
    public close(): void {
        this.db.close();
    }
}
