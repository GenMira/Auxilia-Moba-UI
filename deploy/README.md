# NeoShowcaseへの登録

提供された `neoshowcase-web-service-guide.md` に沿った、2つのRuntimeアプリ構成。
UIとサーバーが別Gitリポジトリなので、それぞれのルートにあるDockerfileからビルドする。
兄弟リポジトリのファイルをNeoShowcaseのビルド中にコピーする必要はない。

```text
ブラウザー ─ HTTPS / WSS → UI Runtime（Nginx、8080）
                           ├ /、画像、JS、CSS → ビルド済みUI
                           └ /api/*、/ws、/healthz → Go Runtime（8080）
```

ブラウザーはUIの同一Originだけを使用する。接続先はUI Runtimeの `BACKEND_URL` で変更する。
`VITE_SERVER_URL`、ブラウザー向けCORS、Cookieの `SameSite=None` は不要。
既存クライアントはHTTPSページなら自動で `wss://` を選ぶ。
NginxはOriginとCookieを保持し、WebSocketのUpgradeを中継する。

## NeoShowcaseの設定値

| 項目 | UIアプリ | サーバーアプリ |
| --- | --- | --- |
| Repository | `GenMira/Auxilia-Moba-UI` | `GenMira/Auxilia-Moba-Server` |
| Deploy Type | Runtime | Runtime |
| Build Type | Dockerfile | Dockerfile |
| Context | `.` | `.` |
| Dockerfile Name | `Dockerfile` | `Dockerfile` |
| Entrypoint / Command | 両方空欄 | 両方空欄 |
| HTTP Port | `8080` | `8080` |
| HTTPS | 有効 | 有効 |
| Auto Shutdown | 無効 | 無効 |
| Artifact Path | 不要（Runtime） | 不要（Runtime） |
| MariaDB | 不要 | 不要 |

1. 両リポジトリの設定変更を公開対象のブランチへ反映し、NeoShowcaseでそのブランチを選ぶ。
2. サーバー用とUI用のHTTPS URLを割り当てる。
3. 以下の環境変数を実際のURLに置き換えて登録する。例のホスト名は仮のもの。
4. サーバーを起動して `/healthz` を確認し、UIを起動する。BuildsのコミットIDとRuntimeログも確認する。

UI Runtime:

```text
PORT=8080
BACKEND_URL=https://your-moba-api.trap.show
```

サーバー Runtime:

```text
PORT=8080
COOKIE_SECURE=true
ALLOWED_ORIGINS=https://your-moba.trap.show
```

`BACKEND_URL` は末尾スラッシュ・パスなしのHTTP(S) Origin。
本番はHTTPSを指定する。Nginxは転送先のTLS証明書を検証する。
`ALLOWED_ORIGINS` はブラウザーに表示されるUIの完全なOrigin（末尾スラッシュなし）。
複数指定時はカンマ区切り。これはAPI/WSのOrigin検証用であり、別Originのブラウザーアクセスを有効にするCORS設定ではない。

NeoShowcaseがTLSを終端してGoへHTTPで転送しても、`COOKIE_SECURE=true` によって
Secure・HttpOnly・SameSite=Strict・Path=/のCookieを発行する。Domain属性は付けず、
ブラウザーがアクセスするUIホストのCookieとして扱う。転送ヘッダーを無条件に信用してSecureを判断しない。

サーバーの `ADDR` はローカル開発用の優先上書き。NeoShowcaseでは未設定にし、
`PORT`・HTTP Port・Dockerfileの公開ポートを8080に揃える。
Node.jsやGoのビルド環境は実行イメージに含まれず、両コンテナとも非rootで動作する。

## 稼働確認

```sh
curl -i https://your-moba-api.trap.show/healthz
curl -i https://your-moba.trap.show/healthz
curl -i -X POST https://your-moba.trap.show/api/session \
  -H 'Origin: https://your-moba.trap.show'
```

ヘルスチェックは200と `{"status":"ok"}` を返す。UIの `/healthz` はGoまで転送するので、
UIのコンテナがhealthyならバックエンドへの到達も確認できる。
session応答のSet-CookieにSecure/HttpOnly/SameSite=Strictがあることを確認する。
異なるブラウザープロファイルでUIを開き、DevToolsで `/ws` が101になり、
マッチングと状態同期が進むことを確認する。

- 502/503: まずサーバー側 `/healthz`、次にUI側 `/healthz`、Runtimeログ、BACKEND_URL・HTTP Portを確認する。
- session/WSの403: サーバーのALLOWED_ORIGINSと、UIの実際のOriginを比較する。
- WSの401: Cookieが作成・送信されたか、UIとAPIをブラウザーから別ホストで開いていないか確認する。
- Backend停止時のUIヘルスチェック失敗は想定どおり。NginxはDNSを起動時に固定せず、転送時に解決し直す。

## ローカルのコンテナ検証

UIとサーバーを現在の兄弟ディレクトリ配置にして、UIディレクトリで実行する。
このComposeファイルはローカル検証用で、NeoShowcaseへの登録には使わない。

```sh
docker compose -p auxilia-neo-check -f compose.neoshowcase.yml up --build -d
curl http://127.0.0.1:18080/healthz
```

`http://127.0.0.1:18080` を開く。ローカルHTTP専用にCOOKIE_SECURE=falseを指定しており、
本番のtrueとは分けている。`TEST_URL=http://127.0.0.1:18080` を設定すると既存のブラウザーテストを
コンテナ構成に対して実行できる。

```sh
docker compose -p auxilia-neo-check -f compose.neoshowcase.yml down
```

現在のサーバーはメモリー内のセッション・試合を持つため、**サーバーは1インスタンス**で運用する。
再起動・デプロイで試合が失われる。DB・JWTは使っておらず、この設定のために新規導入しない。
この変更は設定ファイルの実装であり、GitへのpushやNeoShowcase上のアプリ登録・公開は別途行う。

## 検証記録（2026-10-04）

- UI・サーバーのDockerイメージをビルドし、ビルド中のGoテストが成功。
- Compose構成の両サービスがhealthy。実行ユーザーはUIがUID 101、サーバーがUID 100。
- UI経由の `/healthz` が200とJSONを返し、不許可Originのsession要求は403。
- `TEST_URL=http://127.0.0.1:18080` で `node tests/lobby.mjs` が成功。Nginx経由の2プレイヤー、Cookie共有タブ、マッチング、移動・攻撃・死亡復活、再接続、リコール、退出を確認。
- UIのLintとGit差分チェックが成功。本番のNeoShowcase URLでのHTTPS/WSS確認と実公開は未実施。
