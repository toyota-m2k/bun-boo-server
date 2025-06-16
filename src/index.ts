import { Elysia } from "elysia";
import { readFileSync } from "fs";
import { join } from "path";
import config from "../private/config.ts";
import { booSetup } from "./routing.ts";

const app = new Elysia()
  .onError(({ code, error, set, request }) => {
    // エラーメッセージをコンソールに出力
    console.error(`${code} - ${request.url}`);

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
  .get("/", () => {
    return "I'm bun-boo-server!";
  })
  
booSetup(app)
.listen(config.server.port);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
    
