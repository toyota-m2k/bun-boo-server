import { Elysia } from "elysia";
import { readFileSync } from "fs";
import { join } from "path";
import config from "../private/config.ts";
import { booSetup } from "./routing.ts";
import { logger } from "./Logger.ts";
import MediaFileManager from "./data/MediaFileManager";
import target from "../private/target";

// グローバル変数としてmanagerを宣言
let manager: MediaFileManager;

async function main() {
    try {
        // MediaFileManagerの初期化
        manager = await MediaFileManager.create(target);
        await manager.initialize();
        manager.startWatching();

        // Elysiaアプリケーションの設定
        const app = new Elysia()
            .onError(({ code, error, set, request }) => {
                // エラーメッセージをコンソールに出力
                logger.error(`${code} - ${request.url}`, error);

                // エラーコードに応じてステータスコードとメッセージを設定
                const errorResponses = {
                    NOT_FOUND: {
                        status: 404,
                        message: "お探しのページは存在しないか、移動した可能性があります。"
                    },
                    VALIDATION: {
                        status: 400,
                        message: "リクエストの形式が正しくありません。"
                    },
                    INTERNAL_SERVER_ERROR: {
                        status: 500,
                        message: "サーバーでエラーが発生しました。"
                    },
                    UNAUTHORIZED: {
                        status: 401,
                        message: "認証が必要です。"
                    },
                    FORBIDDEN: {
                        status: 403,
                        message: "アクセスが拒否されました。"
                    }
                };

                // エラーコードに対応するレスポンスを取得（デフォルトは500エラー）
                const response = errorResponses[code as keyof typeof errorResponses] || {
                    status: 500,
                    message: "予期せぬエラーが発生しました。"
                };

                // ステータスコードを設定
                set.status = response.status;

                // エラーレスポンスを返す
                return {
                    error: response.message,
                    code: code,
                    path: error instanceof Error ? error.message : String(error)
                };
            })
            .get("/", () => "Hello World!")
            .listen(3000);

        logger.info(
            `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
        );
    } catch (error) {
        logger.error("アプリケーションの起動に失敗しました:", error);
        process.exit(1);
    }
}

// 終了処理
process.on('SIGINT', async () => {
    logger.info('アプリケーションを終了します...');
    if (manager) {
        await manager.stopWatching();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('アプリケーションを終了します...');
    if (manager) {
        await manager.stopWatching();
    }
    process.exit(0);
});

// 未処理の例外をキャッチ
process.on('uncaughtException', async (error) => {
    logger.error('未処理の例外が発生しました:', error);
    if (manager) {
        await manager.stopWatching();
    }
    process.exit(1);
});

// 未処理のPromise拒否をキャッチ
process.on('unhandledRejection', async (reason, promise) => {
    logger.error('未処理のPromise拒否が発生しました:', reason);
    if (manager) {
        await manager.stopWatching();
    }
    process.exit(1);
});

// アプリケーションを起動
main();
    
