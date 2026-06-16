---
name: report-progress
description: Use when the user reports phase progress, test results, or a final go/no-go review on a Nolto plan from Cursor. Wraps update_phase_status, record_phase_test_result, and record_plan_review with the correct status and verdict literals.
---

## このスキルを使う状況

ユーザーが「フェーズ 2 を完了にして」「テスト結果を Nolto に記録して」「このプランのレビューで GO を出して」と言ったとき、このスキルが起動します。操作の種類に応じて以下の 3 つのツールを使い分けます。

## ツールの使い分け

### A. フェーズのステータス更新 → `update_phase_status`

フェーズの進捗を変更するときに使います。

```
update_phase_status({
  planId: "<uuid>",
  phaseId: "<uuid>",
  status: "in_progress",   // not_started | in_progress | done | discarded
  message: "実装完了。レビュー待ち。"  // 任意、最大 1000 文字 (MESSAGE_MAX)
})
```

**有効なステータス値**: `not_started` / `in_progress` / `done` / `discarded`

状態遷移はサーバー側で検証されます。許可されていない遷移（例: `not_started` → `done`）の場合はエラーが返るので、そのメッセージをそのままユーザーに伝えてください。

### B. フェーズのテスト結果記録 → `record_phase_test_result`

テスト実行の結果を記録するときに使います。

```
record_phase_test_result({
  planId: "<uuid>",
  phaseId: "<uuid>",
  verdict: "passed",   // passed | failed | skipped
  round: 1,            // 1 以上の整数、省略時は自動採番
  summary: "全 42 テストが通過。カバレッジ 87%。"  // 任意、最大 1000 文字
})
```

**有効な verdict 値**: `passed`（合格） / `failed`（不合格） / `skipped`（対象外）

`round` はテストサイクル番号です。同じフェーズで複数回テストを記録する場合（例: RED→GREEN サイクル）は `round` を 1 から順に増やします。省略すると前回 + 1 が自動で付きます。

### C. プランレビュー記録 → `record_plan_review`

最終的な承認・差し戻し判断を記録するときに使います。

```
record_plan_review({
  planId: "<uuid>",
  verdict: "go",   // go | no_go
  summary: "全フェーズ完了、リリース承認。"  // 任意、最大 1000 文字
})
```

**有効な verdict 値**: `go`（GO・承認） / `no_go`（NO-GO・差し戻し）

## planId / phaseId の特定

planId や phaseId が手元にない場合は以下の手順で取得します:

1. `list_plans` でプラン一覧を取得し、対象プランの `planId` を確認する。
2. `get_plan` でプラン詳細を取得し、フェーズ一覧と各 `phaseId` を確認する。

## メッセージ / サマリーの長さ

`message` および `summary` フィールドは最大 1,000 文字（`MESSAGE_MAX`）です。それを超える場合は要約してから渡してください。

## エラー処理

| エラー | 対処 |
|--------|------|
| `401 Unauthorized` | 認証が切れています。**ヘッドレス環境では `nolto login --client cursor`**（`@nolto/cli` >= 0.3.0）で再認証、デスクトップは Cursor の MCP 設定で nolto を再接続するようユーザーに案内してください。 |
| `429 Too Many Requests` | `Retry-After` ヘッダーの秒数だけ待ってから再試行します。 |
| 状態遷移エラー | サーバーから返ったエラーメッセージをそのままユーザーに表示します。 |
| 無効な verdict / status | 上記の有効値一覧を確認し、正しい値でリトライします。 |

## キュー版 (オプトイン)

セッション終了時にまとめて送りたい場合は、ダイレクト呼び出しの代わりに `nolto queue` コマンドを使ってください:

```
nolto queue phase-status <planId> <phaseId> in_progress
nolto queue phase-test <planId> <phaseId> passed --round 1
nolto queue plan-status <planId> done
nolto queue plan-review <planId> go
```

**注意**: ダイレクト呼び出しとキュー版を**同じ更新に対して両方使わないでください**（二重送信になります）。`entry.id` による サーバー側の重複排除は現バージョンのスコープ外です。

セッション終了時の自動送信は、このプラグイン同梱の Stop hook (`hooks/hooks.json`) が Cursor によって自動的に発火するため、ユーザー側の追加設定は不要です。

## 関連スキル

- **register-plan** — フェーズを含むプランを初めて登録するときに使います。
- **plan-status** — 更新後の進捗を非エンジニア向けに要約するときに使います。
