import MetaDataDB, { MetaData } from "../src/data/MetaDataDB";

// テストデータの準備
const testData: MetaData[] = [
    {
        path: "D:/photos/vacation/IMG_001.jpg",
        label: "夏休み",
        description: "海での写真",
        mark: 1,
        rating: 5,
        flag: 1,
        option: JSON.stringify({ tags: ["海", "夏"] })
    },
    {
        path: "D:/photos/vacation/IMG_002.jpg",
        label: "夏休み",
        description: "山での写真",
        mark: 0,
        rating: 4,
        flag: 0,
        option: JSON.stringify({ tags: ["山", "夏"] })
    },
    {
        path: "D:/photos/work/IMG_003.jpg",
        label: "仕事",
        description: "会議の写真",
        mark: 1,
        rating: 2,
        flag: 2,
        option: JSON.stringify({ tags: ["仕事", "会議"] })
    }
];

// データベースの初期化
const db = new MetaDataDB("test-metadata-alt.db");

try {
    console.log("メタデータDBのテストを開始します...");

    // データの追加
    console.log("\n1. メタデータの追加テスト");
    for (const data of testData) {
        db.upsert(data);
        console.log(`追加: ${data.path}`);
    }

    // 単一データの取得
    console.log("\n2. 単一データの取得テスト");
    const singleData = db.getByPath(testData[0].path);
    console.log("取得結果:", singleData);

    // 複数データの取得
    console.log("\n3. 複数データの取得テスト");
    const paths = testData.map(d => d.path);
    const multipleData = db.getByPaths(paths);
    console.log(`取得件数: ${multipleData.length}`);

    // フラグによる検索
    console.log("\n4. フラグによる検索テスト");
    const flaggedData = db.getByFlag(1);
    console.log(`フラグ1のデータ数: ${flaggedData.length}`);

    // レーティングによる検索
    console.log("\n5. レーティングによる検索テスト");
    const highRatedData = db.getByRating(4);
    console.log(`レーティング4以上のデータ数: ${highRatedData.length}`);

    // ラベルによる検索
    console.log("\n6. ラベルによる検索テスト");
    const labeledData = db.searchByLabel("夏休み");
    console.log(`"夏休み"ラベルのデータ数: ${labeledData.length}`);

    // データの更新
    console.log("\n7. データの更新テスト");
    const updateData = { ...testData[0], rating: 3 };
    db.upsert(updateData);
    const updatedData = db.getByPath(updateData.path);
    console.log("更新後のデータ:", updatedData);

    // データの削除
    console.log("\n8. データの削除テスト");
    db.delete(testData[2].path);
    const remainingData = db.getByPaths(paths);
    console.log(`削除後のデータ数: ${remainingData.length}`);

} catch (error) {
    console.error("テスト中にエラーが発生しました:", error);
} finally {
    // データベースを閉じる
    db.close();
    console.log("\nテストを終了します。");
} 