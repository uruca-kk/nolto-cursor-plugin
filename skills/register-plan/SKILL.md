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

`register_plan` には `projectId` を毎回明示して渡してください。

**最初にリポジトリ root の `nolto.json` を確認します。**

1. リポジトリ root（`.git` があるディレクトリ）に `nolto.json` が存在するか確認します。
2. **`nolto.json` がある場合**: そのファイルの `projectId` フィールドを使い、すべての呼び出しに `projectId` を明示します。手順 4 へ進んでください。
3. **`nolto.json` がない場合**:
   - `list_projects` でプロジェクト一覧を取得し、どのプロジェクトに登録するかユーザーに選んでもらいます。
   - リポジトリ root に `nolto.json` を作成することを提案します:
     ```json
     { "projectId": "<選んだ UUID>" }
     ```
   - または `nolto link <projectId>` コマンド（`@nolto/cli` が必要）を案内してください。
   - 「コミットするとチーム全員に紐付けが共有されます」と補足します。

**注意**: 複数のプロジェクトに参加しているユーザーが `projectId` を省略したまま書き込み操作を呼び出すと、サーバーがエラーを返します。`nolto.json` または明示的な `projectId` が必要です。

- **`set_default_project` の用途**: 読み取り操作（`list_plans`、`get_plan`）のデフォルト設定として機能します。複数プロジェクトの書き込みには効きません。

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
| `401 Unauthorized` | 認証が切れています。**ヘッドレス環境では `nolto login --client cursor`**（`@nolto/cli` >= 0.3.0）で再認証、デスクトップは Cursor の MCP 設定で nolto を再接続するようユーザーに案内してください。 |
| `429 Too Many Requests` | `Retry-After` ヘッダーの秒数だけ待ってから再試行します。 |
| バリデーションエラー | どのフィールドが上限を超えたか（タイトル 500 文字超、フェーズ数 50 超など）を明示してユーザーに確認します。 |
| projectId 未指定（単一プロジェクト） | `list_projects` を呼んで一覧を示し、選択を求めます。 |
| 複数プロジェクトで projectId 省略 | サーバーがエラーを返します。`nolto.json` を root に作成するか（`{ "projectId": "<uuid>" }`）、`projectId` を明示して再試行します。 |

## 関連スキル

- **report-progress** — 登録後にフェーズのステータスやテスト結果を更新するときに使います。
- **plan-status** — プランの進捗を非エンジニア向けに要約するときに使います。

---

## Form 1: 構造化済みプランを直接登録する (`register_structured_plan`)

### いつ使うか vs `register_plan`

| | `register_plan` | `register_structured_plan` |
|---|---|---|
| 入力 | raw markdown | raw markdown + StructuredPlan (2-level) |
| haiku 抽出ステップ | あり | **なし（スキップ）** |
| sonnet 要約ステップ | あり | あり |
| 課金 | 1 トランスフォーム | 1 トランスフォーム（同じ） |

AI ツールが既に構造化処理を済ませており、`StructuredPlan` オブジェクトを持っている場合に使います。haiku 抽出が不要になるため処理が速くなります。**構造が不正な場合はエラーで拒否されます（`register_plan` へのフォールバックはありません）。**

### StructuredPlan の形式とサイズ上限

```
StructuredPlan = {
  plan: {
    title: string,          // 最大 500 文字
    scale?: string | null,  // 規模表記（任意）
    status: "not_started" | "in_progress" | "done"  // 3値のみ（"discarded" は不可）
  },
  groups: Array<{           // 最大 50 グループ
    id: string,             // 最大 256 文字
    label: string,          // 最大 500 文字
    status: "not_started" | "in_progress" | "done",
    body_md?: string | null,  // 最大 20,000 文字
    tasks: Array<{            // 1グループあたり最大 100 タスク
      id: string,
      label: string,
      status: "not_started" | "in_progress" | "done",
      body_md?: string | null,
      depends_on?: string[],
      diff?: string | null
    }>
  }>,
  context_sections: Array<{  // 最大 50 セクション
    id: string,
    label: string,
    kind: "confirmed_decisions" | "open_questions" | "other",
    body_md: string          // 最大 20,000 文字
  }>
}
```

**重要**: `status` は 3 値のみ（`not_started` / `in_progress` / `done`）。`discarded` は StructuredPlan 内では無効です（プラン全体の `plan.status` には `discarded` を指定できます）。
**重要**: 不明なキーは厳密に拒否されます（`.strict()`）。

### 呼び出しサンプル

```
register_structured_plan({
  projectId: "<uuid>",
  plan: {
    title: "My Feature Plan",
    content: "<ファイル全文 (raw markdown)>",
    status: "not_started"
  },
  structuredPlan: {
    plan: { title: "My Feature Plan", status: "not_started" },
    groups: [
      {
        id: "phase-1",
        label: "Phase 1: セットアップ",
        status: "not_started",
        tasks: [
          { id: "task-1-1", label: "依存関係の追加", status: "not_started" },
          { id: "task-1-2", label: "DB マイグレーション", status: "not_started" }
        ]
      }
    ],
    context_sections: []
  }
})
```

### D3 ルール（no-fallback）

`structuredPlan` が無効な場合（サイズ超過・不明キー・`discarded` status など）、サーバーはフィールドパス付きのエラーを返します。`register_plan` に自動でフォールバックすることはありません。エラーメッセージに従い `structuredPlan` を修正して再試行してください。
