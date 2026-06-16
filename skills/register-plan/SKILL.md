---
name: register-plan
description: Use when the user asks to register a plan in Nolto from Cursor, share a plan, or push a plan markdown file from this repo to Nolto. Reads a local plan markdown, derives title and phases, and calls the register_plan MCP tool.
---

## このスキルを使う状況

ユーザーが「このプランを Nolto に登録して」「plan.md を Nolto に送って」「Nolto でプロジェクトにプランを追加して」と依頼したとき、このスキルが起動します。ローカルのマークダウンファイルを読み込み、タイトルとフェーズを抽出して `register_plan` を呼び出します。

## 手順

### 1. ファイルを読み込む

ユーザーが指定したパス（例: `implementation_plan.md`、`docs/plan.md`）のファイルを Read ツールで開きます。パスが指定されていない場合はカレントディレクトリにある `*plan*.md` や `*PLAN*.md` を提案してください。

### 2. タイトルとフェーズを抽出する

- **タイトル**: 最初の `# ` 見出し（H1）をプランタイトルとして使います（最大 500 文字 = `PLAN_TITLE_MAX`）。H1 がなければファイル名（拡張子除く）をタイトルにします。
- **フェーズ**: `## ` 見出し（H2）を各フェーズとして扱います。H2 見出しをタイトル（最大 500 文字 = `PHASE_TITLE_MAX`）、その下の本文をコンテンツ（最大 20,000 文字 = `PHASE_CONTENT_MAX`）として切り出します。フェーズ数の上限は 50（`PHASES_MAX`）です。50 を超える場合はユーザーに確認してから絞り込みます。
- **ステータス**: 指定がなければ `not_started` で登録します。ステータスは `not_started` / `in_progress` / `done` / `discarded` の 4 値のみ有効です。

### 3. projectId を確認する

`register_plan` には `projectId` が必要です。ただし、デフォルトプロジェクトが設定済みの場合は `projectId` を省略できます。

- **デフォルト設定済みの場合**: `projectId` なしで `register_plan` を呼び出せます。手順 4 へ進んでください。
- **デフォルト未設定の場合（または確認したい場合）**: `list_projects` でプロジェクト一覧を取得し、どのプロジェクトに登録するかユーザーに選んでもらい、選択したプロジェクトの UUID を `projectId` として渡します。
- **サーバーが `projectId required / no default project` エラーを返した場合**: `list_projects` を呼んで一覧を示し、再試行します。
- **将来の呼び出しでデフォルトを固定したい場合**: ユーザーが「デフォルトプロジェクトを設定したい」と明示したときのみ `set_default_project` を使います（プロジェクト UUID が必要です）。

### 4. register_plan を呼び出す

```
register_plan({
  projectId: "<uuid>",
  title: "<H1 テキスト>",
  content: "<ファイル全文>",
  phases: [
    { title: "<H2 テキスト>", content: "<本文>", status: "not_started" },
    ...
  ],
  status: "not_started"
})
```

### 5. 結果を報告する

レスポンスから以下を日本語でユーザーに伝えます:

- `planId` — 登録されたプランの ID
- `transformStatus` — LLM 変換キューの状態（`queued` / `processing` / `completed` / `failed`）
- `url` — プラン詳細ページの URL（`https://nolto.app/...`）

例: 「プランを登録しました。planId: `abc-123`。Nolto ダッシュボードで確認できます: https://nolto.app/projects/…」

## 推奨テンプレート

プランを作成する前に、プラグイン同梱の plan-template.md（templates/plan-template.md）に推奨フォーマットがあります。参照してください。

テンプレートには以下の規則が示されています:

- **日本語で書く** — Nolto の分類器（型1 = 実装プラン）は本文をそのまま日本語ビューに表示します。英語プランは非エンジニア向けの可視化が読みづらくなります。
- **作業語彙の見出し** — H2 見出しに「フェーズ」「Phase」「Step」「タスク」などの作業語彙を含めると、分類器が実装プランとして正しく識別します（インベントリや調査メモと混同されません）。チェックボックスも併用してください。
- **2 階層まで** — H2（フェーズ）と H3（サブフェーズ）が有効です。H4 以降は親フェーズ本文に吸収されます。
- **ステータスマーカー** — H2 見出しに「✅ 完了」「済」「進行中」「着手」を含めるか、チェックボックスの全完了 / 混在 / 全未了によって自動判定されます。詳細はテンプレート内のコメントを参照してください。
- **確定事項 / 未解決事項** — これらの H2 は文脈情報（フェーズ外）として扱われ、フェーズ一覧には含まれません。

このテンプレートに沿って書かれたプランは、`register_plan` に渡すと分類器が型1（実装プラン）として正確に処理します。

## エラー処理

| エラー | 対処 |
|--------|------|
| `401 Unauthorized` | OAuth トークンが切れています。Cursor の MCP 設定で nolto を再接続するようユーザーに案内してください。 |
| `429 Too Many Requests` | `Retry-After` ヘッダーの秒数だけ待ってから再試行します。 |
| バリデーションエラー | どのフィールドが上限を超えたか（タイトル 500 文字超、フェーズ数 50 超など）を明示してユーザーに確認します。 |
| projectId 未指定 | `list_projects` を呼んで一覧を示し、選択を求めます。 |

## 関連スキル

- **report-progress** — 登録後にフェーズのステータスやテスト結果を更新するときに使います。
- **plan-status** — プランの進捗を非エンジニア向けに要約するときに使います。
