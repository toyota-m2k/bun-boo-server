import { createWriteStream, WriteStream, existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import config from '../private/config';

// ログレベルの定義
const Level = {
    VERBOSE: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4,
    FATAL: 5
} as const;

type LogLevel = keyof typeof Level;

// 外部に公開するインターフェース
export interface ILogger {
    verbose(message: string, error?: unknown): void;
    debug(message: string, error?: unknown): void;
    info(message: string, error?: unknown): void;
    warn(message: string, error?: unknown): void;
    error(message: string, error?: unknown): void;
    fatal(message: string, error?: unknown): void;
}

// 内部実装クラス
class LoggerImpl implements ILogger {
    private static instance: LoggerImpl;
    private logStream: WriteStream | null = null;
    private currentLogSize: number = 0;

    private constructor() {
        this.initializeLogFile();
    }

    public static getInstance(): LoggerImpl {
        if (!LoggerImpl.instance) {
            LoggerImpl.instance = new LoggerImpl();
        }
        return LoggerImpl.instance;
    }

    private initializeLogFile(): void {
        if (config.logger.fileLevel === undefined) return;

        const logDir = dirname(config.logger.filePath);
        if (!existsSync(logDir)) {
            mkdirSync(logDir, { recursive: true });
        }

        if (existsSync(config.logger.filePath)) {
            const stats = statSync(config.logger.filePath);
            this.currentLogSize = stats.size;
        }

        this.logStream = createWriteStream(config.logger.filePath, { flags: 'a' });
    }

    private rotateLogFile(): void {
        if (!this.logStream) return;

        this.logStream.end();

        // 既存のローテーションファイルを移動
        for (let i = config.logger.maxRotationCount - 1; i >= 0; i--) {
            const oldPath = i === 0 ? config.logger.filePath : `${config.logger.filePath}.${i}`;
            const newPath = `${config.logger.filePath}.${i + 1}`;
            
            if (existsSync(oldPath)) {
                if (i === config.logger.maxRotationCount - 1) {
                    // 最大数のローテーションファイルを削除
                    this.logStream = createWriteStream(oldPath, { flags: 'w' });
                    this.currentLogSize = 0;
                    return;
                }
                // ファイルを移動
                this.logStream = createWriteStream(newPath, { flags: 'w' });
                this.currentLogSize = 0;
            }
        }

        // 新しいログファイルを作成
        this.logStream = createWriteStream(config.logger.filePath, { flags: 'w' });
        this.currentLogSize = 0;
    }

    private isError(error: unknown): error is Error {
        return error instanceof Error;
    }

    private formatLogMessage(level: LogLevel, message: string, error?: unknown): string {
        const timestamp = new Date().toISOString();
        let logMessage = `[${timestamp}] [${level}] ${message}`;
        
        if (error !== undefined) {
            if (this.isError(error)) {
                // Error型の場合
                if (error.message) {
                    logMessage += `\nError: ${error.message}`;
                }
                if (error.stack) {
                    logMessage += `\nStack: ${error.stack}`;
                }
                // エラーオブジェクトのその他のプロパティを出力
                const errorProps = Object.getOwnPropertyNames(error)
                    .filter(prop => prop !== 'message' && prop !== 'stack' && prop !== 'name')
                    .map(prop => `${prop}: ${(error as any)[prop]}`)
                    .join('\n');
                if (errorProps) {
                    logMessage += `\nAdditional properties:\n${errorProps}`;
                }
            } else {
                // Error型でない場合
                try {
                    // オブジェクトの場合はJSON.stringifyを使用
                    const errorStr = typeof error === 'object' && error !== null
                        ? JSON.stringify(error, null, 2)
                        : String(error);
                    logMessage += `\nError details: ${errorStr}`;
                } catch (e) {
                    // JSON.stringifyが失敗した場合（循環参照など）はString()を使用
                    logMessage += `\nError details: ${String(error)}`;
                }
            }
        }
        
        return logMessage + '\n';
    }

    private put(level: LogLevel, message: string, error?: unknown): void {
        const formattedMessage = this.formatLogMessage(level, message, error);

        // コンソール出力
        switch (level) {
            case 'ERROR':
            case 'FATAL':
                console.error(formattedMessage);
                break;
            case 'WARN':
                console.warn(formattedMessage);
                break;
            default:
                console.log(formattedMessage);
        }

        // ファイル出力
        if (this.logStream && config.logger.fileLevel !== undefined && 
            Level[level] >= Level[config.logger.fileLevel as LogLevel]) {
            
            this.currentLogSize += formattedMessage.length;
            
            if (this.currentLogSize > config.logger.maxFileSize) {
                this.rotateLogFile();
            }
            
            this.logStream.write(formattedMessage);
        }
    }

    public verbose(message: string, error?: unknown): void {
        this.put('VERBOSE', message, error);
    }

    public debug(message: string, error?: unknown): void {
        this.put('DEBUG', message, error);
    }

    public info(message: string, error?: unknown): void {
        this.put('INFO', message, error);
    }

    public warn(message: string, error?: unknown): void {
        this.put('WARN', message, error);
    }

    public error(message: string, error?: unknown): void {
        this.put('ERROR', message, error);
    }

    public fatal(message: string, error?: unknown): void {
        this.put('FATAL', message, error);
    }
}

// シングルトンインスタンスをエクスポート
export const logger: ILogger = LoggerImpl.getInstance(); 