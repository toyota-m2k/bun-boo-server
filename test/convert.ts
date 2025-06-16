import MediaConvert from "../src/data/MediaConvert";
import { join } from "path";

async function main() {
    const converter = new MediaConvert();

    try {
        // テスト用のパス
        const inputPath = "D:/videos/test.mp4";
        const outputPath = "D:/videos/test_converted.mp4";

        console.log("動画コンバートのテストを開始します...");
        console.log(`入力ファイル: ${inputPath}`);
        console.log(`出力ファイル: ${outputPath}`);

        // コンバート実行
        const converted = await converter.convert(inputPath, outputPath);

        if (converted) {
            console.log("コンバートが完了しました");
        } else {
            console.log("コンバートは不要でした");
        }

    } catch (error) {
        console.error("テスト中にエラーが発生しました:", error);
    }
}

main(); 