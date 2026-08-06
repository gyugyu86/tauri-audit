# tauri-audit（日本語）

[Tauri](https://tauri.app) v2 / v1 アプリ向けのセキュリティ静的解析 CLI です。設定とソースを
**アプリを実行せずに**静的パースするので、高速・安全で CI に組み込めます。

> このページは入口です。ルール一覧・出力形式・設計上の判断など詳細は
> **[英語版 README](README.md) が正**です。

> **ステータス：プレリリース（0.1.1）。** ルール8本、順次追加中です。
>
> **非公式プロジェクトです。** Tauri プロジェクトおよび Tauri Programme within the
> Commons Conservancy とは関係がなく、公認も受けていません。

## 位置づけ

tauri-audit は既存の依存スキャナを**置き換えるものではなく補完するもの**です。

| 対象 | ツール |
| --- | --- |
| **設定ミス** — 危険なフラグ、過度に広い capability scope、CSP 未設定 | **tauri-audit** |
| **Rust 依存の脆弱性** | [`cargo-audit`](https://github.com/rustsec/rustsec) / RustSec |
| **npm 依存の脆弱性** | `npm audit` |
| 言語横断の汎用コードパターン | [Semgrep](https://semgrep.dev) / [CodeQL](https://codeql.github.com) |

Semgrep や CodeQL は**コード**を解析します。tauri-audit が見るのは、そのコードに何を許すかを
決めている**設定**です。`$CONFIG/**` と `$APPCONFIG/**` が別物であることは汎用ツールには
分かりません。

Tauri 固有のアドバイザリのうち「設定と組み合わさって初めて問題になる」ごく少数は
tauri-audit も見ます（単純なバージョン照合だと誤解を招くため）が、依存監査全般は担当しません。

**誤検知を避けるために検知漏れを許容する設計です。** 免除条件を静的に検証できないルールは
`heuristic` として報告し、既定ではビルドを落としません。

## インストール

```bash
npm install -g tauri-audit
# インストールせずに実行
npx tauri-audit ./my-tauri-app
```

Node.js >= 22.12 が必要です。

## 基本的な使い方

```bash
tauri-audit <対象パス> [オプション]
```

| オプション | 効果 |
| --- | --- |
| `--json` | JSON 出力 |
| `--markdown` | Markdown レポート |
| `--sarif` | SARIF 2.1.0（GitHub code scanning 用） |
| `--category <id>` | SARIF のカテゴリ（`run.automationDetails.id`） |
| `--strict` | `heuristic` の critical/high でも失敗させる |
| `--no-fail` | finding では失敗させない（操作エラーは 2 のまま） |

| 終了コード | 意味 | `--no-fail` で抑制される？ |
| --- | --- | --- |
| `0` | 解析が完了し、ゲート対象なし | — |
| `1` | ゲート対象の finding あり | される |
| `2` | 操作エラー、**または解析がプロジェクトを完全にカバーできなかった** | されない |

既定のゲート対象は **high-confidence の critical・high** です。

#### 解析不能 ≠ クリーン

exit `2` は不正なフラグだけではありません。設定がパースできない・v1/v2 を判別できない・
サイズ超過でスキップされた・そもそも存在しない場合、**そのファイルにはルールが1つも走って
いません**。この状態の「finding ゼロ」は安全ではなく沈黙です。tauri-audit はこれを成功として
報告せず、解析できなかったものを表示して `2` を返します。

`--no-fail` は「見つかったもので CI を止めるな」という finding についての宣言であって
「実行が成功した」という主張ではないため、これは抑制しません。

## severity と confidence は独立

すべての finding は 2 つの独立した値を持ちます。

- **severity**（`critical`〜`info`）＝ 本物だった場合どれだけ深刻か
- **confidence**（`high` / `heuristic`）＝ 本物だとどれだけ確信できるか

この 2 つは統合しません。重大でも確度が低ければ `heuristic` のままです。Tauri の CVE には
「〜なら影響なし」という免除条件を持つものが複数あり、それらは静的にクロスチェックできないため
恒久的に `heuristic` に固定し、finding 本文に手動確認の手順を書いています。

## 正直な限界（Honest limitations）

意図的な設計判断です。自分の誤検知で CI を落とす静的解析ツールは、誰も使い続けません。

- **アプリを実行しない。** 実行時に決まることは見えません。
- **免除条件は「推測」ではなく「降格」で扱う。** 静的に確認できない条件がある場合は
  `heuristic` に留め、確認手順を finding に書きます。
- **行番号は JSON では正確、JSON5 / TOML では近似。**
- **v1 / v2 を判別できない設定はスキップし、警告ログに出す**（推測して誤ったルールを当てない）。
- **データフローは（実装時も）単一関数スコープ近似のみ。**
- **データフロー解析は未実装。** 値の流れを追わないため「攻撃者が制御する入力が危険な呼び出しに
  届くか」は判定できません。実装時（Phase 3）も単一関数スコープ近似に留めます。
- **Rust ソース解析は未実装**（tree-sitter で対応予定）。
- **lockfile 対応**：`Cargo.lock` / `package-lock.json` / `pnpm-lock.yaml`(v5/v6/v9) は
  確定版を読みます。`yarn.lock` / `bun.lock*` は認識しますがパースせず、マニフェストの
  レンジからの推定に落として finding にその旨を明記します。
- **ルールごとに証拠の強さが違います**（英語 README の Evidence 列を参照）。

### v2 での価値について正直に

決定的に危険と言い切れる設定は v2 では多くありません。v1 の allowlist が粗く `dangerous*`
フラグを持っていたのに対し、v2 の capability は default-deny かつコマンド単位だからです。
v2 での主な価値は「危険なフラグを見つける」ことではなく、**capability 付与のレビューを助ける**
ことにあります（過度に広い fs scope、確認できない CVE 免除条件、CSP 未設定など）。
v2 のアプリでゲート対象の finding が出ないのは期待どおりの結果で、v2 の設計の功績です。

詳細・ルール一覧・ロードマップは [英語版 README](README.md) を参照してください。

## ライセンス

MIT（[LICENSE](LICENSE)）。`tests/corpus/` 配下のテストフィクスチャは第三者の設定ファイルで、
それぞれ元のライセンスのもとで各ディレクトリの `PROVENANCE.md` に出典・commit・ライセンスを
記録しています。これらはテストデータであり、配布パッケージには含まれません（npm には `dist/`
のみを同梱）。
