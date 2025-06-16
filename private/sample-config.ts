/**
 * アプリケーションの設定
 */
export default {
  // サーバー設定
  server: {
    port: 3000
  },

  // FFmpeg関連の設定
  ffprobe: {
    // Windows環境でのffprobeのパス
    path: "c:/bin/tools/ffmpeg/ffprobe.exe"
  },

  ffmpeg: {
    path: "c:/bin/tools/ffmpeg/ffmpeg.exe"
  },

} as const; 