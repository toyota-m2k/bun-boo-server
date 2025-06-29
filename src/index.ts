import { Elysia } from "elysia";
import { cors } from '@elysiajs/cors'
import { readFileSync } from "fs";
import { join } from "path";
import config from "../private/config.ts";
import { booSetup, booShutdown } from "./routing.ts";
import { logger } from "./Logger.ts";
import target from "../private/target";
import { withDelay } from "./utils/AsyncUtils.ts"

async function main() {
    try {
        // Elysiaアプリケーションの設定
        const app = new Elysia()
            .use(cors())
            .onError(({ code, error, set, request }) => {
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

                if (set.status !== 404) {
                    // Not Found 以外のエラーはログに記録
                    logger.error(`${code} - ${request.url}`);
                } else {
                    logger.debug(`${code} - ${request.url}`);
                }

                // エラーレスポンスを返す
                return {
                    error: response.message,
                    code: code,
                    path: error instanceof Error ? error.message : String(error)
                };
            })
            .get("/", () => "bun-boo-server")
            .get("/quit", () => {
                logger.info("bun-boo-server will be stopped by quit request...");
                withDelay(3000, () => {
                    booShutdown()
                    process.exit(0)
                });
                return "bun-boo-server is stopping...";
            })

        booSetup(app)
            .listen(config.server.port)

        logger.info(
            `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
        );
    } catch (error) {
        logger.error("bun-boo-server could't be started.", error);
        process.exit(1);
    }
}

// 終了処理
process.on('SIGINT', async () => {
    logger.info('bun-boo-server will be stopped...(SIGINT)');
    booShutdown()
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('bun-boo-server will be stopped...(SIGTERM)');
    booShutdown()
    process.exit(0);
});

// 未処理の例外をキャッチ
process.on('uncaughtException', async (error) => {
    logger.error('bun-boo-server will be stopped...', error);
    booShutdown()
    process.exit(1);
});

// 未処理のPromise拒否をキャッチ
process.on('unhandledRejection', async (reason, promise) => {
    logger.info('bun-boo-server will be stopped...');
    booShutdown()
    process.exit(1);
});

// アプリケーションを起動
main();
    
