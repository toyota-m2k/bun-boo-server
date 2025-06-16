import { spawn } from "child_process";
import { stat } from "fs/promises";
import config from "../../private/config";

export default class MediaConverter {
    private ffmpegPath: string;

    constructor() {
        this.ffmpegPath = config.ffmpeg.path;
    }

    /**
     * 動画ファイルを変換
     */
    public async convert(inputPath: string, outputPath: string): Promise<void> {
        try {
            // 入力ファイルの存在確認
            await stat(inputPath);

            // ffmpegコマンドを実行
            const ffmpeg = spawn(this.ffmpegPath, [
                '-i', inputPath,
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '23',
                '-c:a', 'aac',
                '-b:a', '128k',
                outputPath
            ]);

            return new Promise((resolve, reject) => {
                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`ffmpeg exited with code ${code}`));
                    }
                });

                ffmpeg.on('error', (err) => {
                    reject(err);
                });
            });
        } catch (error) {
            console.error(`動画変換中にエラーが発生: ${inputPath}`, error);
            throw error;
        }
    }
} 