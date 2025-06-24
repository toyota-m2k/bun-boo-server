/**
 * メディアソースの設定
 */
export default {
    sources: [
      // {
      //   path: "D:/AChannel",  // メディアファイルが格納されているフォルダ
      //   name: "AChannel",  // 表示名
      //   recursive: true,  // サブフォルダも検索
      //   cloud: false,  // ローカルストレージ
      //   rawData: {
      //     path: "I:/マイドライブ/AChannel",
      //     cloud: true,
      //     recursive: true
      //   }
      // },
      {
        path: "D:/dist",
        name: "Test",  // 表示名
        recursive: true,  // サブフォルダも検索
        cloud: false,  // クラウドストレージ
        rawData: {
          path: "D:/videos",
          cloud: true,
          recursive: true,
        }
      },
    ],
  } as const; 