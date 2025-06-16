/**
 * メディアソースの設定
 */
export default {
    sources: [
      {
        path: "D:/videos",  // メディアファイルが格納されているフォルダ
        name: "MyCamera",  // 表示名
        recursive: true,  // サブフォルダも検索
        cloud: false,  // ローカルストレージ
        rawData: {
          path: "I:/マイドライブ/AChannel-L",
          cloud: true,
          recursive: true
        }
      },
    ],
    cloud: {
      scanInterval: 1 * 60 * 1000  // 1分
    }
  } as const; 