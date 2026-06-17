# Nolto — Cursor Plugin

Cursor から Nolto の MCP サーバーに接続し、プランの登録・フェーズ進捗の報告・ステータスの確認をスキルで操作できる公式プラグインです。

このプラグインには以下が同梱されています:

- **MCP サーバー設定** (`mcp.json` — `https://nolto.app/mcp` への HTTP 接続)
- **4 つのスキル** (`register-plan` / `report-progress` / `plan-status` / `link-project`)
- **Stop フック** (`hooks/hooks.json` — セッション終了時に `nolto flush --detach` を自動実行)
- **テンプレート** (`templates/plan-template.md` / `templates/AGENTS.md.sample`)

---

## インストール

> **重要（cursor-agent 2026.06 系で実機確認）**: `cursor-agent --plugin-dir <dir>` は **MCP サーバーもスキルも登録しません**（読み込まれるのは rules / commands / agents のみ）。そのため v0.1.0 では、Cursor 標準の設定ロケーション（`~/.cursor/` または プロジェクトの `.cursor/`）に配置します。Claude の `/plugin …` スラッシュコマンドは Cursor には適用されません。

### Option A — インストールスクリプト（推奨）

```bash
git clone https://github.com/uruca-kk/nolto-cursor-plugin.git
cd nolto-cursor-plugin
./scripts/install.sh             # ~/.cursor/ に配置（全プロジェクト共通）
# または
./scripts/install.sh --project   # カレントの ./.cursor/ に配置（このプロジェクトのみ）
```

スクリプト（`jq` が必要）は既存設定を壊さずマージします:
- `skills/*` を `<cursor>/skills/<name>/` にコピー
- `mcp.json` の `nolto` を `<cursor>/mcp.json` の `mcpServers` に**マージ**（他の MCP サーバーは保持）
- Stop フックを `<cursor>/hooks.json` の `.hooks.stop` に**マージ**（他のフックは保持・冪等）

### Option B — 手動配置

| コンポーネント | 配置先 |
|---|---|
| MCP | `~/.cursor/mcp.json`（or `.cursor/mcp.json`）の `mcpServers` に `nolto` を追加 |
| skills | `~/.cursor/skills/<name>/SKILL.md`（or `.cursor/skills/`）へコピー |
| hooks | `~/.cursor/hooks.json`（or `.cursor/hooks.json`）の `.hooks.stop` に追加 |

### Option C — マーケットプレイス（将来）

Cursor マーケットプレイス公開後は、`Add to Cursor` で同梱の `mcp.json` / `skills/` / `hooks/hooks.json` が install 時に自動登録される予定です。

> Cursor は MCP ツールを **`mcp_nolto_<tool>`**（例 `mcp_nolto_register_plan`）として公開します。スキル本文は bare 名（`register_plan`）で書かれていますが、エージェントが自動的に解決して呼び出します。

---

## 認証

### デスクトップ Cursor — OAuth

`~/.cursor/mcp.json` に `nolto`（url のみ）を入れた状態で最初に MCP ツールを呼ぶと、Cursor ネイティブの OAuth 2.1 + PKCE 同意画面がブラウザで開きます（コールバック: `cursor://anysphere.cursor-mcp/oauth/callback`）。承認するとトークンが Cursor に保存されます。install.sh が書き込むのはこの url-only エントリです。

### 推奨: `nolto login`（device-code フロー）

SSH リモート・コンテナ・CI などブラウザを開けない環境では OAuth が完了できません。[`@nolto/cli`](https://www.npmjs.com/package/@nolto/cli)（>= 0.3.0）の `nolto login` は、**別端末（スマホ・ラップトップ）のブラウザ**で承認するだけで済みます。

```bash
npm install -g @nolto/cli
nolto login --client cursor
```

表示 URL を任意の端末で承認すると、トークンを取得して `~/.cursor/mcp.json` の `nolto` に Bearer ヘッダを書き込みます。手動でトークンを扱う必要はありません。

### 代替: Personal API Token を手動で渡す

OAuth の代わりに Personal API Token を直接設定します（実機の `cursor-agent --print` で動作確認済み）。

1. [設定 > API トークン](https://nolto.app/settings/tokens) でトークンを発行します。
2. `~/.cursor/mcp.json`（or `.cursor/mcp.json`）の `nolto` に、環境変数経由でヘッダーを追加します（install.sh は url のみを書き込むので、ヘッダーはここで手動追加）:

```json
{
  "mcpServers": {
    "nolto": {
      "url": "https://nolto.app/mcp",
      "headers": { "Authorization": "Bearer ${env:NOLTO_TOKEN}" }
    }
  }
}
```

3. `NOLTO_TOKEN` を環境変数で渡して実行します:

```bash
NOLTO_TOKEN=<token> cursor-agent --print --force --approve-mcps "Nolto の list_projects を実行して"
```

> **セキュリティ上の注意**: Personal API Token は `mcp:read` と `mcp:write` の両スコープを持ちます。パスワードと同様に扱い、**ソースコードにトークンを直書きしないでください**。CI やコンテナではシークレットマネージャーに保管し、環境変数経由で渡してください。

CLI ツール ([`@nolto/cli`](https://www.npmjs.com/package/@nolto/cli)) も CI パイプラインに適しています（こちらは config か `NOLTO_TOKEN` で独立認証）:

```bash
npm install -g @nolto/cli
nolto init
```

---

## リポジトリとプロジェクトの紐付け

プロジェクトをリポジトリに固定するには、リポジトリ root に `nolto.json` を作成してコミットしてください:

```json
{ "projectId": "00000000-0000-0000-0000-000000000001" }
```

CLI からワンコマンドで作成できます:

```bash
nolto link <projectId>   # nolto.json を書いてコミット案内を表示
nolto link --show        # 現在の紐付けを確認
```

`nolto.json` があると、スキル（Cursor / AI ツール）は起動時にこのファイルを読み込み、すべての MCP 呼び出しで `projectId` を自動で明示します。複数のリポジトリを同一ユーザーで操作する場合でも、混在を防げます。

---

## スキルの使い方

### register-plan — プランを登録する

ローカルのマークダウンファイルを Nolto に登録します。H1 がプランタイトル、H2 が各フェーズとして自動抽出されます。

```
> implementation_plan.md を Nolto に登録して
```

モデルがファイルを読み込み、タイトル・フェーズを抽出して `register_plan` を呼び出します。登録後に planId と確認 URL が返されます。

### report-progress — 進捗を報告する

フェーズのステータス変更・テスト結果の記録・最終レビューの承認/差し戻しを行います。

```
> フェーズ 2 を完了にして
> テスト結果「合格」をラウンド 1 として記録して
> このプランのレビューで GO を出して
```

それぞれ `update_phase_status`、`record_phase_test_result`、`record_plan_review` が呼ばれます。

### plan-status — 状況を確認する

進行中のプランをエンジニア以外にも伝わる平易な日本語で要約します。

```
> Nolto の進行中プランを教えて
> このプランのフェーズ進捗は？
```

`list_plans` と `get_plan` を組み合わせて現在のステータスをまとめます。

---

## プランテンプレート / AGENTS.md サンプル

プラグインには **2 つのテンプレートファイル**が同梱されています:

| ファイル | 説明 |
|---|---|
| `templates/plan-template.md` | Nolto 推奨プランテンプレート（日本語・フェーズ・ステータス例付き） |
| `templates/AGENTS.md.sample` | プロジェクトの `AGENTS.md` に貼り付けるガイドラインスニペット |

### 使い方

1. `templates/AGENTS.md.sample` の内容をプロジェクトの `AGENTS.md` に貼り付けます。これにより、このプロジェクトで Cursor がプランを作成するたびに Nolto の規則に従ったフォーマットで書かれるようになります。
2. 実際にプランを書くときは `templates/plan-template.md` を出発点にコピーして編集してください。

### プランは日本語で書く理由

Nolto の分類器パイプライン（型1 = 実装プラン）は本文をそのまま日本語ビューに表示します。英語で書くと非エンジニア向けの可視化が読みづらくなるため、プラン本文は日本語で記述してください。

### ステータスマーカーの 3 つのルール

チェックボックスによる判定は**そのセクション自身の本文**が対象です。`###` サブフェーズのチェックは親 `##` フェーズには**伝播しません**。フェーズ（`##`）のステータスは、見出しマーカーを付けるか、サブフェーズを作らず見出し直下にチェックリストを置くことで設定します。

| ステータス | 判定方法（そのセクション自身の本文） |
|---|---|
| 完了 | H2 見出しに「✅」「完了」「済」を含める、またはチェックボックスが全部 `- [x]` |
| 進行中 | H2 見出しに「進行中」「着手」を含める、または `- [x]` と `- [ ]` が混在 |
| 未着手 | チェックボックスが全部 `- [ ]`、またはチェックボックスが無い |

見出しマーカー（「✅」「進行中」など）は、見出し行または本文の最初の 1 行でのみ認識されます。深い行に書いても拾われません。

---

## Stop フック

### 概要

`scripts/install.sh`（または手動配置）で Stop フックが `~/.cursor/hooks.json`（or プロジェクトの `.cursor/hooks.json`）の `.hooks.stop` に登録されます。Cursor のセッション終了時に `nolto flush --detach` が自動実行されます。

> `cursor-agent --plugin-dir` では同梱の `hooks/hooks.json` は発火しないため、必ず install スクリプト（または手動）で `<cursor>/hooks.json` に配置してください。

### 前提条件（キュー送信はオプトイン）

Stop フックによる一括送信を使う場合のみ必要です。**CLI を入れなくてもプラグイン本体（MCP + スキル）は問題なく使えます。**

- `@nolto/cli >= 0.2.0` が PATH 上にインストールされていること（`npm i -g @nolto/cli`）
- `NOLTO_TOKEN` 環境変数（または `nolto init` で設定したトークン）が設定されていること

### 動作フロー

Cursor セッション中にモデルが `nolto queue <sub> <args>` を呼び出すと、進捗情報がプロジェクトの `.nolto/pending.jsonl` にオフラインで追記されます。セッション終了時に Stop フックが自動的に `nolto flush --detach` を実行します。

`nolto flush --detach` はバックグラウンドプロセスを二重フォーク（detach + unref）して即座に戻るため、Cursor のフック待機をブロックしません。バックグラウンドワーカーがキューの各エントリを Nolto MCP サーバーに送信します。

### CLI 未インストール時の挙動

Stop フックは `nolto` が PATH に無い場合、**エラーを出さず黙って何もしません**（always exit 0）。初回の 1 回だけ「`@nolto/cli` を入れると終了時に自動送信できる」というヒントを表示し（マシンごとに `${XDG_CONFIG_HOME:-$HOME/.config}/nolto/.cli-hint-shown` で抑制）、以降は無音です。旧バージョンの `command not found`（exit 127）表示はこのガードで解消しています。

### ノンブロッキング保証

- CLI 未導入・トークン未設定・ネットワークエラー・429 レート制限のいずれの場合も、フックは **常に exit 0** を返します。
- CLI 導入後のエラーはプロジェクトの `.nolto/flush.log` に記録されます。キューは保持されるため、次回セッション終了時に再送が試みられます。
- Cursor のセッションが中断されることはありません。

### ダイレクトコールとキュー版の使い分け

`report-progress` スキルによるダイレクト MCP 呼び出し（デフォルト）とキュー版は**どちらか一方**を使用してください。同じ更新に両方を使うと二重送信が発生します。

| 用途 | 方法 |
|------|------|
| 即時反映が必要 / 観測可能にしたい | `report-progress` スキル（ダイレクト呼び出し） |
| セッション終了時にまとめて送りたい | `nolto queue` + Stop フック |

---

## ライセンス

MIT — 詳細は [LICENSE](./LICENSE) を参照してください。

---

## リンク

- [nolto-cursor-plugin リポジトリ](https://github.com/uruca-kk/nolto-cursor-plugin)
- [Nolto 公式サイト](https://nolto.app)
- [MCP セットアップガイド](https://nolto.app/docs/guides/mcp-setup)
- [CLI ガイド](https://nolto.app/docs/guides/cli)
- [MCP ツールリファレンス](https://nolto.app/docs/reference/mcp-tools)
- [メインリポジトリ](https://github.com/uruca-kk/nolto)
