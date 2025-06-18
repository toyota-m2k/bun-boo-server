import { spawn } from "child_process";
import { join } from "path";
import config from "../../private/config";
import { logger } from "../Logger";

interface FFProbeResult {
    format: {
        format_name: string;
    };
    streams: Array<{
        codec_type: string;
        codec_name: string;
    }>;
}

export default class MediaConvert {
    private ffprobePath: string;
    private ffmpegPath: string;

    constructor() {
        this.ffprobePath = config.ffprobe.path;
        this.ffmpegPath = config.ffmpeg.path;
    }

    /**
     * ffprobeを使用して動画ファイルの情報を取得
     */
    private async getVideoInfo(inputPath: string): Promise<FFProbeResult> {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn(this.ffprobePath, [
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                inputPath
            ]);

            let output = "";
            let error = "";

            ffprobe.stdout.on("data", (data) => {
                output += data.toString();
            });

            ffprobe.stderr.on("data", (data) => {
                error += data.toString();
            });

            ffprobe.on("close", (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(output) as FFProbeResult;
                        resolve(result);
                    } catch (e) {
                        reject(new Error(`JSONのパースに失敗: ${e}`));
                    }
                } else {
                    reject(new Error(`ffprobeの実行に失敗: ${error}`));
                }
            });
        });
    }

    /**
     * 動画ファイルをコンバート
     * @returns true: コンバートした, false: コンバートしなかった
     */
    public async convert(inputPath: string, outputPath: string): Promise<boolean> {
        try {
            // 動画情報の取得
            const info = await this.getVideoInfo(inputPath);

            // ビデオストリームを探す
            const videoStream = info.streams.find(s => s.codec_type === "video");
            if (!videoStream) {
                throw new Error("ビデオストリームが見つかりません");
            }

            // HEVCでない場合はコンバートしない
            if (videoStream.codec_name.toLowerCase() !== "hevc") {
                logger.info(`${inputPath} はHEVCではないため、コンバートをスキップします`);
                return false;
            }

            logger.info(`${inputPath}： コンバートを開始します`);
            // コンバート実行
            return new Promise((resolve, reject) => {
                const ffmpeg = spawn(this.ffmpegPath, [
                    "-i", inputPath,
                    "-c:v", "libx265",
                    "-x265-params", "chroma-format=420",
                    "-tag:v", "hvc1",
                    "-c:a", "copy",
                    "-movflags", "faststart",
                    outputPath
                ]);

                let error = "";

                ffmpeg.stderr.on("data", (data) => {
                    const e = data.toString()
                    logger.debug(e)
                    error += e;
                });

                ffmpeg.on("close", (code) => {
                    if (code === 0) {
                        logger.info(`${inputPath} のコンバートが完了しました`);
                        resolve(true);
                    } else {
                        reject(new Error(`ffmpegの実行に失敗: ${error}`));
                    }
                });
            });

        } catch (error) {
            logger.error("コンバート中にエラーが発生", error);
            throw error;
        }
    }
}
