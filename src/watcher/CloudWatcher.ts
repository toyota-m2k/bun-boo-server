import config from "../../private/config"
import ComparableFileList from "../data/ComparableFileList"
import { logger } from "../Logger"
import { normalize_path } from "../utils/PathUtils"
import { PathWatcher } from "./PathWatcher"
import { basename } from "path";

export default class CloudWatcher extends PathWatcher {
  private isScanning: boolean = false
  private currentPath: string = ""
  private recursive: boolean = false
  private fileList: ComparableFileList | undefined = undefined
  private scanInterval: number
  private scanTimer: NodeJS.Timeout | undefined = undefined
  private retryList: string[] = []


  constructor(path:string, recursive: boolean, interval: number = config.cloud.scanInterval) {
    super()
    this.currentPath = normalize_path(path)
    this.recursive = recursive
    this.scanInterval = interval
  }

  /**
   * クラウドストレージの監視を開始
   */
  public async start(): Promise<void>{
    console.log(`CloudWatch: start: ${this.currentPath}`)
    // 初回スキャン
    await this.scanCloudPath();

    // 定期的なスキャン（完了を待ってから次を実行）
    const scheduleNextScan = async () => {
      await this.scanCloudPath();
      this.scanTimer = setTimeout(scheduleNextScan, this.scanInterval);
    };
    this.scanTimer = setTimeout(scheduleNextScan, this.scanInterval);
  }

  public async stop(): Promise<boolean> {
    console.log(`CloudWatch: stop: ${this.currentPath}`)
    if (this.scanTimer) {
      clearTimeout(this.scanTimer)
      this.scanTimer = undefined
      return true
    } else {
      return false
    }
  }
  /**
   * クラウドストレージのパスをスキャン
   */
  private async scanCloudPath(): Promise<void> {
    if (this.isScanning) {
      return;
    }

    this.isScanning = true
    try {
      logger.info(`CloudWatch: スキャン開始: ${this.currentPath}`)
      // 現在のファイルリストを作成
      const currentList = await ComparableFileList.create(this.currentPath, this.recursive)
      const previousList = this.fileList
      if (previousList) {
        // 前回のリストから再試行リストを削除
        for (const path of this.retryList) {
          previousList.remove(path);
        }
        this.retryList = [];

        // 前回のファイルリストと比較
        const { onlyInSrc, onlyInDst } = previousList.compare(currentList)

        // 削除されたファイルのイベントを発行
        for (const path of onlyInSrc) {
          this.emit("change", {
            changeType: "Deleted",
            name: basename(path),
            fullPath: path,
          });
        }

        // 追加されたファイルのイベントを発行
        for (const path of onlyInDst) {
          this.emit("change", {
            changeType: "Created",
            name: basename(path),
            fullPath: path,
          });
        }
      }

      // ファイルリストを更新
      this.fileList = currentList;
    } catch (error) {
      console.error(`スキャンに失敗: ${this.currentPath}`, error)
    } finally {
      this.isScanning = false
      logger.info(`CloudWatch: スキャン完了: ${this.currentPath}`)
    }
  }

  public override feedbackCreationError(path: string): void {
    logger.error(`CloudWatcher: feedbackCreationError: ${path}`);
    this.retryList.push(path)
  }
}