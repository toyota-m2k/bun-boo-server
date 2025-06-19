import {dirname, join, normalize, relative} from "path";

export function join_path(...args: string[]): string {
  return join(...args).replace(/\\/g, '/')
}

export function normalize_path(path: string): string {
  return normalize(path).replace(/\\/g, '/');
}

export function relative_path(basePath: string, fullPath: string): string {
  // パスを正規化して末尾のスラッシュを処理
  const normalizedBasePath = normalize(basePath);
  const normalizedFullPath = normalize(fullPath);

  // 相対パスを取得し、区切り文字を '/' に統一
  return relative(normalizedBasePath, normalizedFullPath).replace(/\\/g, '/');
}

export function dirname_path(path: string): string {
  return dirname(normalize(path)).replace(/\\/g, '/');
}

export function remove_trailing_slash(path: string): string {
  const dir = path.replace(/\\/g, '/')
  return dir.endsWith('/') && dir.length > 1 ? dir.slice(0, -1) : dir;
}

