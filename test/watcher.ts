import LocalWatcher from "../src/watcher/PathWatcher";
import type { CloudConfig } from "../src/data/MediaFileManager";

// テスト用の設定
const testConfig: CloudConfig = {
    scanInterval: 5000  // 5秒
};

console.log("PathWatcherのテストを開始します...\n");

const watcher = new LocalWatcher(testConfig);

// ファイル変更イベントのハンドラを設定
watcher.on("change", (event) => {
    console.log("ファイル変更を検出:", {
        path: event.path,
        type: event.type,
        source: event.source
    });
});

async function runTest() {
    try {
        // 1. ローカルパスの監視を追加
        console.log("1. ローカルパスの監視を追加");
        await watcher.addPath("D:/gdrive-L", {
            recursive: true,
            cloud: false,
            startNow: true
        });
        console.log("監視を開始: D:/gdrive-L\n");

        // 2. クラウドパスの監視を追加
        console.log("2. クラウドパスの監視を追加");
        await watcher.addPath("I:/マイドライブ/Photo", {
            recursive: true,
            cloud: true,
            startNow: true
        });
        console.log("監視を開始: I:/マイドライブ/Photo\n");

        // 3. ローカルパスの監視を停止
        console.log("3. ローカルパスの監視を停止");
        watcher.stop("D:/gdrive-L");
        console.log("監視を停止: D:/gdrive-L\n");

        // 4. すべての監視を再開
        console.log("4. すべての監視を再開");
        watcher.startAll();
        console.log("すべての監視を再開しました\n");

        // 5. 30秒間待機して変更を観察
        console.log("5. 30秒間待機して変更を観察");
        await new Promise(resolve => setTimeout(resolve, 30000));
        console.log("待機完了\n");

        // 6. すべての監視を停止
        console.log("6. すべての監視を停止");
        watcher.stopAll();
        console.log("すべての監視を停止しました\n");

        // 7. パスを削除
        console.log("7. パスを削除");
        watcher.removePath("D:/gdrive-L");
        watcher.removePath("I:/マイドライブ/Photo");
        console.log("パスを削除しました\n");

    } catch (error) {
        console.error("\nテスト中にエラーが発生しました:", error);
    }
}

runTest(); 