---
name: link-project
description: Use when the user wants to bind or link this repository to a Nolto project from Cursor — 例「このリポを Nolto に紐付けて」「nolto.json を作って」。Resolves the project and writes nolto.json at the repository root.
---

## このスキルを使う状況

ユーザーが「このリポを Nolto の〈プロジェクト〉に紐付けて」「`nolto.json` を作って」「このリポのプロジェクトを固定して」のように、**このリポジトリと Nolto プロジェクトの紐付け**を求めたときに使います。

リポジトリ root にコミット用の `nolto.json` を作成し、以降このリポジトリでの操作対象プロジェクトを固定します。これにより、複数リポを並行して扱っても取り違えや競合が起きません。

> **重要**: この用途では `set_default_project` を**使わないでください**。それはユーザー単位の単一の共有デフォルトで、複数リポ・複数セッションを並行すると競合します。リポジトリ単位の `nolto.json` を使ってください。

## 手順

1. **プロジェクトを特定する**
   - ユーザーがプロジェクト名または ID を指定していれば、それを使います。
   - 不明・曖昧な場合は `list_projects` を呼び、プロジェクト名と `projectId`（UUID）を提示して、どれに紐付けるかユーザーに確認します。

2. **リポジトリ root を特定する**
   - 現在のリポジトリの root（`.git` があるディレクトリ）を使います。

3. **`nolto.json` を作成 / 更新する**
   - リポジトリ root に、選んだ UUID で `nolto.json` を書き込みます（既存の他のキーがあれば保持します）:

     ```json
     { "projectId": "<選んだ UUID>" }
     ```

4. **コミットを案内する**
   - 「`nolto.json` を git にコミットすると、チーム全員の CLI とスキルが同じプロジェクトを使うようになります」と伝えます。

5. 紐付け後は、すべての Nolto ツール呼び出しで `nolto.json` の `projectId` を明示して渡します。

## 補足

- `@nolto/cli`（>= 0.4.0）が入っていれば、`nolto link <projectId>` コマンドでも同じファイルを作成できます。
- 一時的に別プロジェクトで操作したいときは、ツール呼び出しで `projectId` を明示すれば `nolto.json` より優先されます。
- 紐付けを解除するときは `nolto.json` の `projectId` を削除します（CLI なら `nolto link --unlink`）。

## 関連スキル

- **register-plan** — 紐付け後に、フェーズを含むプランを登録するときに使います。
- **report-progress** — フェーズ進捗・テスト結果・最終レビューを記録するときに使います。
- **plan-status** — 進行中プランを非エンジニア向けに要約するときに使います。
