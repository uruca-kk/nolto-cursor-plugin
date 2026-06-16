---
name: plan-status
description: Use when the user asks for the current state of plans, a summary of a specific plan, or a non-engineer-friendly progress report from Cursor. Calls list_plans and get_plan and summarizes in plain Japanese.
---

## このスキルを使う状況

ユーザーが「Nolto のプランの状況を教えて」「進行中のプランを一覧で見せて」「このプランはどこまで進んだ？」と聞いたとき、このスキルが起動します。エンジニア以外のメンバーにも伝わるよう、平易な日本語でまとめます。

## 手順

### 1. プラン一覧を取得する

```
list_plans({
  projectId: "<uuid>",   // 省略するとデフォルトプロジェクト
  status: "in_progress"  // 任意フィルタ
})
```

プランが多い場合は `status: "in_progress"` で絞り込むと見やすくなります。ユーザーが「全部見たい」と言った場合はフィルタなしで呼びます。

**有効な status フィルタ値**: `not_started` / `in_progress` / `done` / `discarded`

### 2. 詳細が必要なプランを取得する

特定プランの詳細（フェーズ進捗、最新テスト結果、レビュー結果）を確認するには:

```
get_plan({ planId: "<uuid>" })
```

### 3. 日本語で要約する

以下の形式でユーザーに伝えます:

```
【プラン名】新機能リリース計画
ステータス: 進行中
フェーズ進捗: 3/5 完了、1 進行中、1 未着手
最新テスト: フェーズ 3 — 合格（ラウンド 2）
直近のブロッカー: フェーズ 4「本番デプロイ」が未着手。担当者未割当て。
確認ページ: https://nolto.app/projects/…
```

**ステータスの日本語表記**（`PLAN_STATUS_LABELS` 準拠）:

| 値 | 表示 |
|----|------|
| `not_started` | 未着手 |
| `in_progress` | 進行中 |
| `done` | 完了 |
| `discarded` | 破棄 |

### 4. デフォルトプロジェクト未設定の場合

`list_plans` に `projectId` を渡さないとデフォルトプロジェクトが使われます。デフォルトが未設定でエラーになった場合は、`set_default_project` の設定を提案してください。

```
> デフォルトプロジェクトを設定してほしい場合は「Nolto のデフォルトプロジェクトを my-app に設定して」と伝えてください。
```

## エラー処理

| エラー | 対処 |
|--------|------|
| `401 Unauthorized` | OAuth トークンが切れています。Cursor の MCP 設定で nolto を再接続するようユーザーに案内してください。 |
| `429 Too Many Requests` | `Retry-After` ヘッダーの秒数だけ待ってから再試行します。 |
| デフォルトプロジェクト未設定 | `list_projects` で一覧を表示し、`set_default_project` の設定を案内します。 |

## 関連スキル

- **register-plan** — 新しいプランを登録するときに使います。
- **report-progress** — フェーズのステータスやテスト結果を更新するときに使います。
