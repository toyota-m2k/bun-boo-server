import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// シンプルなアイコンのBase64エンコードデータ
const faviconBase64 = `AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAABILAAASCwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3JscAN2cHQDcmxsA3JsbANybGwDcmxsA3JsbANybGwDcmxsA3JsbANybGwDcmxsA3JsbAN2cHQDcmxsAAAAAANybGwDcmxsA3JsbANybGwDcmxsA3JsbANybGwDcmxsA3JsbANybGwDcmxsA3JsbANybGwDcmxsA3JsbAAAAAAAAAAAAAAAAANybGwDXlhMA3p4gK92cHbPcmxvw3Jsb8NybG7PeniAr15YTAAAAAAAAAAAAAAAAAAAAAAAAAAAA3JscANybGwDcmhoA3p4gK9ybG/LYlhL/y4QA/8J6AP/CegD/y4QA/9iWEv/cmxvy3p4gK9yaGgDcmxwAAAAAANybGwDcmxsA3p4fKtybG/LPiQz/vXYA/8F5AP/BeQD/wXkA/8F5AP+9dgD/0IoM/9ybG/Lenh8q3JsbANybGwDcmxsA3p4hK9ybG/LLhAD/wXkA/8F5AP/BeQD/wXkA/8F5AP/BeQD/wXkA/8uEAP/cmxvy3p4hK9ybGwDcmxsA3Jsbs9eVEf/BeQD/wXkA/8F5AP/DewD/wXkA/8F5AP/DewD/wXkA/8F5AP/YlhL/3Jsbs9ybGwDcmxsA3Jsb8MqDAP/BeQD/wXkA/8F5AP/akjf/7dSi/+3Uov/akjf/wXkA/8F5AP/KgwD/3Jsb8NybGwDcmxsA3Jsb8MqDAP/BeQD/wXkA/8F5AP/nwXv/////////+fBe/8F5AP/BeQD/yoMA/9ybG/DcmxsA3JsbANybG7PWlRL/wnkA/8F5AP/BeQD/6cN8/////////+nDfP/BeQD/wXkA/9aVEv/cmxuz3JsbANybGwDenhEr3Jsb8tCKDP/BeQD/wXkA/8N7AP/fr1P/37BT/8N7AP/BeQD/0IoM/9ybG/Lenhcr3JsbANybGwDcmxsA3p4gK9ybG/LQigz/wXkA/8F5AP/BeQD/wXkA/8F5AP/BeQD/0IoM/9ybG/Lenh8q3JsbANybGwAAAAAA3JsbANybGwDeniAr3Jsb8tiWEv/LhAD/wnkA/8J6AP/LhAD/2JYS/9ybG/Lenh8r3JsbANybGwAAAAAAAAAAANybGwDcmxsA15YTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3JsbANybGwAAAAAAAAAAANybGwDcmxsA3JsbANybGwDcmxsA3JsbANybGwDcmxsA3JsbANybGwDcmxsA3JsbANybGwDcmxsA3JsbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==`;

// ファイルパスを作成
const publicDir = join(import.meta.dir, '..', 'private');
const faviconPath = join(publicDir, 'favicon.ico');

// Base64エンコードされたデータをバイナリに変換して保存
try {
  const buffer = Buffer.from(faviconBase64, 'base64');
  writeFileSync(faviconPath, buffer);
  console.log(`Favicon created at ${faviconPath}`);
} catch (error) {
  console.error(`Failed to create favicon: ${error}`);
}