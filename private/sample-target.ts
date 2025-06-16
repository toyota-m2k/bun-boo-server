/**
 * メディアソースの設定
 */
export default {
    sources: [
      {
        path: "C:/photo",  // メディアファイルが格納されているフォルダ
        name: "MyPhoto",  // 表示名
        recursive: true,  // サブフォルダも検索
        cloud: false   // ローカルストレージ
      },
      {
        path: "D:/videos",  // メディアファイルが格納されているフォルダ
        name: "MyVideo",  // 表示名
        recursive: true,  // サブフォルダも検索
        cloud: false,  // ローカルストレージ
        rawData: {
          path: "I:/マイドライブ/AChannel-L",
          cloud: true,    // mounted google drive
          recursive: true
        }
      },
    ],
    cloud: {
      scanInterval: 3 * 60 * 1000  // 3分
    }
  } as const; 