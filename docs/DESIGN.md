# tauri-audit 設計リサーチ（一次情報再検証版）— 2026-07-19

このファイルは tauri-audit の設計上の一次リファレンスである。 CVE の severity・バージョンレンジ・免除条件・公式スキーマの記述は、本ファイルを正とする。 ただし advisory は事後に変わりうるため、実装時は GHSA / RustSec の最新を再取得すること。

前回の設計リサーチの CVE 事実基盤には複数の実質的な誤りがあり、tauri-audit の検出ルールの severity・confidence・バージョンレンジ・免除条件を一次情報（GitHub Security Advisories／NVD／OSV／RustSec／schema.tauri.app／公式監査PDF）で全面的に洗い直した結果、少なくとも 2 件の CVE 記述の訂正、2 ルールの high-confidence→heuristic 降格、および 2026年に新規公開されたアドバイザリ 1 件の追加が必要である。

## TL;DR

- **前回資料の CVE 事実基盤に誤りがある。** CVE-2023-46115 は GHSA ラベルが「Low」（NVD は 5.5 Medium、CNA GitHub は 8.4 High と三者食い違い）で、CVE-2025-31477 は GHSA「High」だが CVSS v4 で 9.3 Critical。さらに **2026年5月6日公開の新規アドバイザリ GHSA-7gmj-67g7-phm9（CVE-2026-42184, is\_local\_url オリジン混同, tauri 2.0〜2.11.0 affected / 2.11.1 patched）** を追加すべき。  
- **「決定的（high-confidence）」を主張していた 2 ルール（TA-VITE-001 updater鍵漏洩／TA-DEP-001 shell open RCE）は免除条件・文脈依存性のため heuristic へ降格すべき。** GHSA ラベルをルール severity の一次基準とする方針は妥当だが、CVSS 出典の食い違いを finding に併記する運用が必須。  
- **2026年7月時点で「Tauri 専用のセキュリティ SAST リンター」は網羅探索の範囲で発見できず**（Victauri はフルスタックテスト用で目的が異なる）、tauri-audit の空白地帯は依然存在。ただしこれは非網羅探索の結果であり不在の証明ではない。

## Key Findings

1. **CVE severity は発行元で食い違い、時系列で変化する。** GHSA ラベル・NVD スコア・CVSS v4 が同一 CVE で異なる実例が複数確認された。tauri-audit は GHSA ラベルを主基準としつつ、finding に CVSS 出典を明記すべき。  
2. **免除条件が存在する CVE は純粋なバージョン照合だと FP を生む。** CVE-2025-31477（open を true 設定または検証regex設定済みなら影響なし）と CVE-2023-46115（Vite以外／envPrefixにTAURI\_を含まない／デフォルト本番ビルドには非埋込）が典型。  
3. **新規アドバイザリ（2026年）：** GHSA-7gmj-67g7-phm9（CVE-2026-42184）は tauri 2.0〜2.11.0 が affected、2.11.1 で patched。Windows/Android のみ、カスタムスキーム登録アプリが対象。  
4. **shell plugin の open は 2.1.0 で deprecated、opener plugin へ移行推奨。** ルール設計は shell:allow-open 検出だけでなく opener plugin の scope も見る必要がある。  
5. **v1 allowlist モデルと v2 capabilities/permissions モデルは全く別構造。** dangerousRemoteDomainIpcAccess・dangerousUseHttpScheme 等の v1 危険フラグは v2 で廃止/移行済み。  
6. **公式 config スキーマの現行バージョンは 2.11.5**（schema.tauri.app/config が draft-07, $id=2.11.5 を配布。2026-07-19 実測）。これに対する ajv バリデーションが現実的。ただしバージョン別 URL は機能しておらず（下記 F 参照）、**スキーマは vendoring する**。

## 詳細

### (A) Tauri セキュリティモデル（v2 公式スキーマ・ドキュメントで確定）

Tauri のセキュリティモデルは Rust コア（フルシステムアクセス）と WebView フロントエンド（IPC 経由のみアクセス）のトラストバウンダリを分離する。IPC ブリッジと capabilities による ACL が中核である。

**app.security 設定フィールド（config.schema.json / schema.tauri.app より確定）：**

- `app.security.csp`：型は Csp | null。**既定値は null で、null の場合 CSP は一切注入・強制されない**（Tauri 公式 Discussion \#11060 でメンテナが「The default CSP value in Tauri is null which means no CSP is enabled or enforced by default (which may change in the future)」と明言）。非null設定時のみ Tauri がコンパイル時に nonce/hash を注入。→「csp が null/未設定」は決定的に検出可能だが危険度は文脈依存。  
- `app.security.devCsp`：開発時のみ注入される CSP。  
- `app.security.dangerousDisableAssetCspModification`：既定 false。boolean または string\[\]。true にすると Tauri の CSP 注入（nonce/hash によるスクリプト・スタイル制限）を無効化。公式スキーマに「WARNING: Only disable this if you know what you are doing and have properly configured the CSP. Your application might be vulnerable to XSS attacks without this Tauri protection」と明記。→ true は決定的に危険シグナル。  
- `app.security.freezePrototype`：既定 false。Object.prototype の凍結（プロトタイプ汚染対策）。既定であり単独では危険とは言えない。  
- `app.security.pattern.use`：`brownfield`（既定）または `isolation`。isolation は IPC メッセージをサンドボックス iframe（SubtleCrypto で暗号化、起動毎に鍵生成）で傍受・検証するセキュリティ機能。brownfield は追加保護なし。→ isolation 不使用は heuristic レベルの指摘。  
- `app.security.assetProtocol.enable`（既定 false）と `assetProtocol.scope`（既定 \[\]）：asset:// プロトコルのスコープ。`**` 等の過緩 glob は危険シグナル。  
- `app.security.capabilities`：既定 \[\]（空の場合 ./capabilities/ の全ファイルが対象）。  
- `app.withGlobalTauri`：既定 false。true にすると window.**TAURI** に API を注入。XSS 時の攻撃面が拡大するため heuristic レベルの指摘対象。  
- updater 関連：現行 v2 スキーマに `dangerousInsecureTransportProtocol` は**存在しない**。updater endpoints は本番で https 必須（URL は https スキーム必須と v1/v2 スキーマに明記）。

**capabilities/\*.json の構造：** `identifier`, `windows`（ワイルドカード `*` 可）, `webviews`, `permissions`, `local`（既定 true）, `remote.urls`（リモートオリジンからの API アクセス許可）, `platforms`。permissions は plugin:scope 形式（例 `shell:allow-open`, `fs:allow-read`）と、fs/shell/http の allow/deny scope（glob）。`windows: ["*"]` や `remote.urls` の広いパターンは危険シグナル。**Linux/Android では iframe とウィンドウ本体の区別ができない問題**があり、GHSA-57fm-592m-34r7 の背景要因となっている。

### (B) CVE・アドバイザリ一覧表（一次情報：GitHub Security Advisories, NVD, OSV, RustSec）

tauri-apps/tauri と plugins-workspace の全公開アドバイザリ（2026年7月時点、GitHub advisory 一覧ページで網羅確認）：

| ID (GHSA / CVE) | 現GHSA severity | CVSS（出典明記） | affected（厳密レンジ） | patched | エコシステム | 免除条件 / not affected if | 静的検出シグナル (confidence) |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| GHSA-7gmj-67g7-phm9 / CVE-2026-42184（is\_local\_url オリジン混同）**【新規2026】** | Moderate | 6.1 CVSS v4（GHSA）; `CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:P/VC:L/VI:H/VA:L/SC:N/SI:N/SA:N` | tauri (cargo) \>=2.0, \<=2.11.0 | \>=2.11.1 | cargo | **Windows/Android のみ。カスタム URI スキームを register\_uri\_scheme\_protocol で登録しているアプリのみ。macOS/Linux は非該当** | tauri \<2.11.1 かつ register\_uri\_scheme\_protocol 使用 (heuristic) |
| GHSA-c9pr-q8gx-3mgp / CVE-2025-31477（shell open scope 検証不備 RCE） | High（GHSAラベル） | 9.3 Critical CVSS v4（GHSA/OSV）`CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H`; NVD は 9.8 Critical CVSS v3.1（`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`, source [nvd@nist.gov](mailto:nvd@nist.gov) Primary）。CWE-20 | @tauri-apps/plugin-shell (npm) \<=2.2.0; tauri-plugin-shell (cargo) \<=2.2.0 | 2.2.1 | npm \+ cargo | **open を明示的に true 設定、または検証regex を設定済みなら影響なし** | plugin-shell \<2.2.1 かつ open エンドポイント有効かつ scope 未設定 (heuristic) |
| GHSA-57fm-592m-34r7 / CVE-2024-35222（iframe オリジンチェックバイパス） | Moderate | 5.9 Moderate CVSS v3.1（GHSA）`AV:N/AC:H/PR:L/UI:R/S:U/C:H/I:L/A:L`。CWE-284 | tauri (cargo) \<=1.6.6; および \>=2.0.0-beta.0, \<=2.0.0-beta.19 | 1.6.7; 2.0.0-beta.20 | cargo | XSS 等スクリプト実行がスクリプト有効 iframe 内で必要。**v2 安定版は非該当（beta のみ）** | tauri \<1.6.7 または v2 beta \<beta.20（決定的だが v2 安定版は無関係） |
| GHSA-2rcp-jvr4-r259 / CVE-2023-46115（updater 鍵 Vite envPrefix 漏洩） | **Low（GHSAラベル）** | NVD 5.5 Medium CVSS v3.1（`AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`, source NIST）; CNA GitHub 8.4 High（`S:C/C:H/I:H`）。**NVD が明示的にスコア不一致フラグ**。CWE-522/CWE-200 | @tauri-apps/cli & tauri-cli \>=1.0.0, \<1.5.6; および \>=2.0.0-alpha.0, \<2.0.0-alpha.16 | 1.5.6; 2.0.0-alpha.16 | npm \+ cargo | **Vite 以外のフレームワークは非該当。envPrefix が \['VITE\_'\] のみなら非該当。デフォルト本番ビルドには埋め込まれず、デバッグビルドかつフロントで直接参照時のみ実漏洩。`grep -r "TAURI_PRIVATE_KEY" dist/` で要確認** | vite.config に envPrefix \+ 'TAURI\_' 記載（設定一致は決定的だが「実漏洩」は非決定的） (heuristic) |
| GHSA-wmff-grcw-jcfm / CVE-2023-34460（dotfiles スコープチェック退行） | Moderate | 4.8 CVSS v3.1（GHSA）`AV:A/AC:L/PR:H/UI:N/S:C/C:L/I:L/A:N`。CWE-285 | tauri (cargo) \=1.4.0（1.4.0 のみ） | 1.4.1 | cargo | fs エンドポイントでワイルドカードスコープ使用時のみ。macOS/Linux のみ | tauri \==1.4.0（バージョン照合は決定的だが、免除条件が静的検証不能なため **heuristic**。下記 Recommendations 3 の訂正を参照）|
| GHSA-4wm2-cwcf-wwvp / CVE-2023-31134（オープンリダイレクトで IPC 露出） | Moderate | 4.8 CVSS v3.1（GHSA）`AV:A/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N` | tauri (cargo) \<1.3; \>=1.0.0,\<1.0.9; \>=1.1.0,\<1.1.4; \>=1.2.0,\<1.2.5 | 1.3; 1.0.9; 1.1.4; 1.2.5 | cargo | 任意 URL へのリダイレクト機能を実装している場合のみ。WA：リダイレクト入力を制限 | tauri 該当レンジ（バージョンは決定的、exploit は機能依存で heuristic） |
| GHSA-6mv3-wm7j-h4w5 / CVE-2022-46171（fs glob 過緩・ドットファイル露出） | Moderate | CVSS v3.1（GHSA）`AV:A/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N`。CWE-22 | tauri (cargo) \>=1.0.0,\<1.0.8; \>=1.1.0,\<1.1.3; \>=1.2.0,\<1.2.3; \>=2.0.0-alpha.0,\<2.0.0-alpha.2 | 1.0.8; 1.1.3; 1.2.3; 2.0.0-alpha.2 | cargo | ワイルドカード（\*, ?, \[...\]）を含むスコープのみ。\*\* は非該当 | tauri 該当バージョン かつ fs scope に \* 含む (heuristic) |
| GHSA-q9wv-22m9-vhqh / RUSTSEC-2022-0091（fs スコープ部分バイパス） | Low | 2.3 Low CVSS v3.1（RustSec）`AV:L/AC:H/PR:H/UI:R/S:C/C:L/I:N/A:N` | patched \>=1.0.7,\<1.1.0 および \>=1.1.2 | 1.0.7系 / 1.1.2 | cargo | ファイルダイアログ/ドラッグ&ドロップで glob 文字使用時のみ | 依存バージョン照合 (heuristic) |
| GHSA-28m8-9j7v-x499（readDir シンボリックリンクバイパス） | Low | —（GHSA Low） | v1系（1.0.6 以前相当） | 1.0.6系 | cargo | readDir エンドポイント有効時 | 依存バージョン照合 (heuristic) |

補足：RustSec 側では RUSTSEC-2022-0091（fs partial bypass）、tauri readDir enumeration（CVE-2022-39215, Snyk medium 5.3）等が cargo エコシステムで追跡されており、cargo-audit/RustSec と役割分担する。npm 側は npm audit が @tauri-apps/\* を追跡する。

### (C) 検出ルール候補一覧（severity \+ confidence 推奨と一次情報根拠）

**tauri.conf.json 設定系（TA-CONF）：**

- TA-CONF-001 `app.security.csp` が null/未設定 → medium / **heuristic**（既定が null で危険度はリモートコンテンツ読込有無に依存。公式が「may change in the future」）。  
- TA-CONF-002 `dangerousDisableAssetCspModification: true` → high / **high**（公式スキーマが XSS 脆弱化を明記、決定的）。  
- TA-CONF-003 `pattern.use` が isolation でない（brownfield） → low / heuristic。  
- TA-CONF-004 `assetProtocol.scope` に `**` 等過緩 glob → medium / heuristic。  
- TA-CONF-005 `withGlobalTauri: true` → low / heuristic（XSS 攻撃面拡大）。  
- TA-CONF-006 `freezePrototype: false`（既定） → info / heuristic。  
- TA-CONF-007〜010（v1 危険フラグ、下記 D 参照）。

**capabilities/permissions 系（TA-CAP）：**

- TA-CAP-001 `windows: ["*"]` ワイルドカード → low / heuristic。  
- TA-CAP-002 `remote.urls` に広いパターン（`https://*` 等） → high / heuristic（リモートオリジンに IPC 露出、GHSA-57fm 背景）。  
- TA-CAP-003 fs scope に過緩 glob（`$HOME/**`, `**`） → medium / heuristic。  
- TA-CAP-004 shell allow scope で任意引数（args: true） → high / heuristic。  
- TA-CAP-005 http scope に `https://**` 等 → medium / heuristic。  
- TA-CAP-006 `shell:allow-open` かつ scope 未設定 → high / **heuristic**（CVE-2025-31477 の免除条件があり決定的にできない。opener plugin 移行推奨も併記）。  
- TA-CAP-007 `local: false` かつ remote 有効 → medium / heuristic。

**依存バージョン系（TA-DEP）：**

- TA-DEP-001 `@tauri-apps/plugin-shell` / `tauri-plugin-shell` \< 2.2.1（CVE-2025-31477） → high / **heuristic**（**前回 high-confidence から降格**。免除条件：open を true 設定 or 検証regex 設定済みなら FP）。  
- TA-DEP-002 `tauri` crate \< 2.11.1（CVE-2026-42184）→ medium / heuristic（Windows/Android かつ register\_uri\_scheme\_protocol 使用時のみ）。  
- TA-DEP-003 `@tauri-apps/cli` / `tauri-cli` \< 1.5.6 / \< 2.0.0-alpha.16（CVE-2023-46115）→ low / heuristic。

**vite.config 系（TA-VITE）：**

- TA-VITE-001 `vite.config.*` の envPrefix に `'TAURI_'` を含む（CVE-2023-46115）→ low / **heuristic**（**前回 high-confidence から降格**。設定一致は決定的だが「実際に鍵が漏洩する」は非決定的：デフォルト本番ビルドには埋め込まれず、デバッグビルドかつフロント直接参照時のみ。GHSA severity も Low）。advisory 本文の一次記述「Example: `grep -r "TAURI_PRIVATE_KEY" dist/`  Using only the `envPrefix: ['VITE_'],` or any other framework than Vite means you are not impacted by this advisory」を finding メッセージに含めるべき。

### (D) v1 allowlist モデル（v1検出層）と v1→v2 対応表

v1 の `tauri.conf.json` は `tauri.allowlist.*` 構造（opt-in のみ、false は無効）：

- `allowlist.all: true` → 全 API 有効（危険、high-confidence 検出可）。  
- `allowlist.fs.scope`（glob）, `allowlist.shell.scope`/`open`/`execute`/`sidecar`, `allowlist.http.scope`, `allowlist.protocol.asset`/`assetScope` 等。  
- `security.dangerousRemoteDomainIpcAccess`（配列、リモートドメインに IPC 露出）→ high-confidence 危険シグナル。  
- `security.dangerousUseHttpScheme: true`（Windows で http://.localhost を使用、mixed content 許容で低セキュア）→ high-confidence。  
- `security.dangerousDisableAssetCspModification`, `security.freezePrototype`（v1 にも存在）。

**v1→v2 対応表：** | v1 | v2 | |---|---| | `tauri.allowlist.*` | `capabilities/*.json` の permissions（ACL） | | `allowlist.protocol.assetScope` | `app.security.assetProtocol.scope` | | `security.dangerousRemoteDomainIpcAccess` | capability の `remote.urls` | | `security.dangerousUseHttpScheme` | `app.windows[].useHttpsScheme`（意味反転、既定 http on Windows） | | `build.withGlobalTauri` | `app.withGlobalTauri` | | updater Cargo feature | `@tauri-apps/plugin-updater` | | `tauri.api.shell` / shell-open-api | `tauri-plugin-shell` / `tauri-plugin-opener` |

### (E) 競合・空白地帯分析（2026年7月時点、非網羅）

- **Tauri 専用 SAST リンター：** GitHub/npm/crates.io の網羅探索範囲で「Tauri 設定・capability を静的解析するセキュリティ監査リンター」は発見できず。Victauri（4DA-Systems）はフルスタックテスト（DOM/IPC/Rust/DB を実行時に introspect する 28 個の MCP ツール、debug ビルドにサーバ埋込）で目的が全く異なり、browser mode は 2026-06-09 に削除済み。tauri-browser も自動化用途。→ **tauri-audit の空白地帯は依然存在。ただしこれは非網羅探索の結果であり不在の証明ではない。**  
- **Semgrep / CodeQL：** 汎用 SAST。Tauri 向け公式・コミュニティの専用 ruleset は確認できず（Semgrep レジストリに p/typescript, p/nodejs 等はあるが Tauri 特化なし）。tauri-audit は Semgrep より高精度な設定・capability 解析で差別化可能。  
- **cargo-audit/RustSec と npm audit：** 依存バージョン脆弱性を担当。tauri-audit は設定・capability・データフローの誤設定検出で役割分担すべき（TA-DEP 系は cargo-audit と重複するため補完的位置づけ、または cargo-audit 出力の取込を検討）。  
- **Tauri 公式 Future Work：** v2.tauri.app/security/future/ に SBOM 抽出・フロントエンド資産抽出ツールの不在が将来課題として明記（「For the frontend stack we are not aware of similar solutions... no simple tooling is available. We are planning to provide such tooling or make it easier to extract assets」）。Rust 側は cargo-auditable を SBOM 用に言及。→ tauri-audit がこの空白を埋める余地あり。

### (F) アーキテクチャ・実装技術（現況）

- **TypeScript 主体ハイブリッド：** 設定パーサ・JS/TS 解析・SARIF 生成は TS、Rust 解析は tree-sitter。  
- **tree-sitter-rust（npm）：** 現行 v0.24.0（2025年4月公開、npm で 275+ プロジェクトが依存）。node-tree-sitter は v0.25.0 で Node-API ベース（NAN から移行済み）。TS から Rust AST 走査は実用的。  
- **TOML パーサ：** Tauri.toml 対応に必要。JSON5：tauri.conf.json5 対応に必要（Tauri 公式が config-json5/config-toml Cargo feature で対応）。  
- **ajv \+ Tauri 公式スキーマ：** schema.tauri.app/config（draft-07, 現行 $id=2.11.5）による設定バリデーションは現実的。**ただしバージョン別 URL は実測上機能していない**（2026-07-19 検証）：`/config/2.9.4`・`/config/2` はいずれも $id=2.11.5 の文書をバイト単位で同一（154933 bytes）に返し、v2 のバージョンパスは全て最新 v2 のエイリアスである。したがって「対象アプリの tauri バージョンに応じたスキーマ選択」は URL 経由では実現できず、**スキーマは `schemas/` に vendoring して特定版をローカルに固定する**（v2 151KB + v1 120KB。v1 は `/config/1`・`/config/1.6.0` が 123198 bytes・$id なしの別文書として正しく配信される）。  
- **SARIF 2.1.0：** GitHub code scanning は SARIF 2.1.0 のサブセットを要求。`github/codeql-action/upload-sarif@v4`（現行）でアップロード。**2025年7月22日以降、同一 tool+category の複数 SARIF run 結合は廃止**され、各 run に一意の category（SARIF の `run.automationDetails.id` プロパティに対応）が必要。GitHub Changelog（2025-07-21）verbatim:「Starting on July 22nd, 2025, GitHub code scanning will no longer combine multiple SARIF files that share the same tool and category properties. Impacted SARIF files will also be rejected」。エラー文言は「A delivery cannot contain multiple runs with the same category. Please upload a single run per category」。gzip 圧縮で最大 10MB 制限。`security-severity` プロパティで CVSS 相当スコアを渡せる。

### (G) 第三者監査（Radically Open Security）

- **v2 監査：** Radically Open Security "Penetration Test Report Tauri 2.0 V 1.0"（Amsterdam, August 7th 2024、監査人 @gronke・@pcwizz、NLnet/NGI 資金）verbatim:「The security audit took place between November 10, 2023 and August 3, 2024... During this crystal-box penetration test we found 11 High, 2 Elevated, 3 Moderate, 5 Low and 2 Info-severity issues」。主要 finding：TAU2-003（任意 origin/frame から IPC 呼出可能→GHSA-57fm の基）、TAU2-069/070（開発サーバのディレクトリトラバーサル、認証なしでディスク露出）、TAU2-068（開発サーバの非暗号化通信）、TAU2-073（Android 開発モードで SSL 検証欠如）、isolation frame の鍵材料が抽出可能。多くは v2 安定版までに修正（IPC リライト、dev サーバ露出の再設計、iframe API 露出の強化、fs/http plugin の scope 検証と rid アクセス修正）。  
- **v1 監査（2021年、retest 2022年2月）：** TRI-012（パストラバーサル read/write）、TRI-014（updater race code exec）、TRI-005/006（INVOKE\_KEY 漏洩で任意 JS が Rust API 呼出）、TRI-004（lax CSP）、TRI-026（asset protocol が CSP 非対象）。  
- **ルール逆算元として有用：** dev サーバ露出、asset:// の CSP バイパス、isolation frame 鍵抽出などは tauri-audit の検出ルール候補の裏付けになる。

## 前回資料からの訂正点（明確に区別）

1. **CVE-2023-46115 の severity：** 前回「High」→ 現 GHSA ラベルは **Low**。NVD 5.5 Medium（AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N, source NIST）、CNA GitHub 8.4 High（S:C/C:H/I:H）と三者食い違い（NVD が明示的にスコア不一致フラグ）。  
2. **CVE-2023-46115 の判定：** 前回「決定的（high-confidence）」→ **heuristic に降格**。envPrefix 一致は決定的だが実漏洩はデバッグビルド+フロント直接参照時のみで、デフォルト本番ビルドには非埋込。  
3. **CVE-2025-31477 の免除条件追加：** 「open を true 設定 or 検証regex 設定済みなら影響なし」を反映。TA-DEP-001 を **high-confidence → heuristic に降格**。  
4. **TA-VITE-001 を high-confidence → heuristic に降格**（上記2と連動）。  
5. **新規アドバイザリ追加：** GHSA-7gmj-67g7-phm9 / CVE-2026-42184（is\_local\_url オリジン混同、tweidinger により 2026年5月6日公開、tauri \>=2.0 \<=2.11.0 affected / 2.11.1 patched、Moderate）。verbatim:「A flaw in Tauri's is\_local\_url() function causes it to incorrectly classify remote URLs as trusted local origins on Windows and Android... The check passes for any URL starting with [http://app](http://app)., including [http://app.evil.com/」。](http://app.evil.com/」。)  
6. **shell open の deprecated 化：** 2.1.0 で deprecated（`#[deprecated(since = "2.1.0", note = "Use tauri-plugin-opener instead.")]`）、opener plugin 移行推奨をルールメッセージに反映。  
7. **CVSS 出典明記の原則追加：** 全 CVE finding に GHSA/NVD/CVSS v4 のどの出典かを明記。

## Recommendations

1. **severity 出典方針：** GHSA ラベルをルール severity の一次基準とする（Tauri が CNA として自プロジェクトの影響を最もよく理解しているため妥当）。ただし CVSS スコアが食い違う場合は finding に「GHSA: Low / NVD: 5.5 Medium / CNA: 8.4 High」のように全出典を併記。severity と confidence は独立に扱う。  
2. **免除条件のあるルールは必ず heuristic：** TA-DEP-001（shell open）, TA-VITE-001（updater鍵）, TA-CAP-006 は免除条件があるため high-confidence にしない。finding メッセージに確認手順（`grep -r "TAURI_PRIVATE_KEY" dist/`、capability の open 設定確認）を含める。  
3. **high-confidence を維持できるルール：** TA-CONF-002（dangerousDisableAssetCspModification: true）、v1 の allowlist.all/dangerousRemoteDomainIpcAccess/dangerousUseHttpScheme。これらは「設定値がその状態にあること」自体が危険であり、判定と危険性が同一軸にあるため FP ゼロを保てる。

   **訂正（2026-07-20）：** 本項は当初 GHSA-wmff（tauri \==1.4.0 の極狭レンジ）も high-confidence 可としていたが、これは誤りだった。**「バージョン一致の決定性」と「脆弱性成立の決定性」は別軸である。** GHSA-wmff はバージョン照合こそ `==1.4.0` で完全に決定的だが、実際に脆弱かどうかは免除条件（fs エンドポイントでワイルドカードスコープ使用時のみ、かつ macOS/Linux のみ）に依存し、後者は静的にクロスチェックできない。confidence は「脆弱性が成立しているとどれだけ確信できるか」を表す軸なので、**バージョンレンジが狭いことは high-confidence の根拠にならない。** 免除条件を持つ CVE は例外なく heuristic とする（`docs/CONVENTIONS.md` の不変条件どおり）。  
4. **バージョンレンジ照合の厳密化：** 安定版と beta/alpha プレリリースを混同しないこと（CVE-2024-35222 は v2 beta のみで安定版は無関係、CVE-2023-46115 は alpha のみ）。npm と cargo 両エコシステムを別々に照合。  
5. **スキーマ駆動バリデーション：** ajv \+ **vendoring した**スキーマ（`schemas/`）で検証する。バージョン別 URL は最新にエイリアスされるため特定版はローカルに固定する（上記 F 参照）。v1/v2 の判別結果に応じて使うスキーマを切り替える。未知フィールドや型不一致は info レベルで報告。  
6. **SARIF 出力：** 各 run に一意 category を付与（2025年7月の GitHub 仕様変更対応、`run.automationDetails.id`）。security-severity に GHSA ベースのスコアを設定。  
7. **段階的リリース：** (a) まず high-confidence 決定的ルール（TA-CONF-002, v1 危険フラグ, 狭レンジ CVE）で FP ゼロを実証 → (b) heuristic ルール（capability glob, 依存バージョン）を confidence 分離して追加 → (c) データフロー（単一関数スコープ近似）で IPC command の入力検証欠如を検出。**ベンチマーク：正しく書かれた実在アプリ（Kanri, En Croissant, Surrealist 等 OSS）のコーパスで high-confidence FP をゼロに保つ**。これを超えたら該当ルールを heuristic に降格。

## Caveats

- **不在の主張は非網羅：** 「Tauri 専用 SAST が存在しない」は GitHub/npm/crates.io の探索範囲での結果であり、不在の数学的証明ではない。  
- **CVSS スコアは常に出典依存：** 同一 CVE で GHSA/NVD/CNA/CVSS v4 が食い違うため、単一スコアを絶対視しない。  
- **アドバイザリは時系列で変化：** severity ラベルやレンジは事後変更されうる（CVE-2023-46115 の例）。tauri-audit は定期的に advisory DB を再取得すべき。  
- **免除条件は静的解析の限界：** 「実際に脆弱か」は実行時・ビルド設定依存の場合があり、静的解析は「疑い」までしか示せないケースがある（heuristic として明示）。  
- **v2 安定版 vs beta：** CVE-2024-35222 のように v2 では beta のみ該当で安定版は無関係な CVE があり、バージョン照合を誤ると FP になる。  
- **一部の旧アドバイザリは cargo エコシステムのみ：** GHSA-wmff-grcw-jcfm と GHSA-4wm2-cwcf-wwvp は cargo(Rust) のみリスト（npm レンジ・プレリリースレンジの記載なし）。CVSS 4.8 は GitHub/GHSA 割当で、これらに CVSS v4 は存在しない。

## 一次情報 URL 集

- GitHub Security Advisories（tauri）: [https://github.com/tauri-apps/tauri/security/advisories](https://github.com/tauri-apps/tauri/security/advisories)  
- GHSA-7gmj-67g7-phm9: [https://github.com/tauri-apps/tauri/security/advisories/GHSA-7gmj-67g7-phm9](https://github.com/tauri-apps/tauri/security/advisories/GHSA-7gmj-67g7-phm9)  
- GHSA-c9pr-q8gx-3mgp: [https://github.com/tauri-apps/plugins-workspace/security/advisories/GHSA-c9pr-q8gx-3mgp](https://github.com/tauri-apps/plugins-workspace/security/advisories/GHSA-c9pr-q8gx-3mgp)  
- GHSA-57fm-592m-34r7: [https://github.com/tauri-apps/tauri/security/advisories/GHSA-57fm-592m-34r7](https://github.com/tauri-apps/tauri/security/advisories/GHSA-57fm-592m-34r7)  
- GHSA-2rcp-jvr4-r259: [https://github.com/tauri-apps/tauri/security/advisories/GHSA-2rcp-jvr4-r259](https://github.com/tauri-apps/tauri/security/advisories/GHSA-2rcp-jvr4-r259)  
- GHSA-wmff-grcw-jcfm: [https://github.com/tauri-apps/tauri/security/advisories/GHSA-wmff-grcw-jcfm](https://github.com/tauri-apps/tauri/security/advisories/GHSA-wmff-grcw-jcfm)  
- GHSA-4wm2-cwcf-wwvp: [https://github.com/tauri-apps/tauri/security/advisories/GHSA-4wm2-cwcf-wwvp](https://github.com/tauri-apps/tauri/security/advisories/GHSA-4wm2-cwcf-wwvp)  
- GHSA-6mv3-wm7j-h4w5: [https://github.com/tauri-apps/tauri/security/advisories/GHSA-6mv3-wm7j-h4w5](https://github.com/tauri-apps/tauri/security/advisories/GHSA-6mv3-wm7j-h4w5)  
- NVD CVE-2023-46115: [https://nvd.nist.gov/vuln/detail/CVE-2023-46115](https://nvd.nist.gov/vuln/detail/CVE-2023-46115)  
- OSV CVE-2025-31477: [https://osv.dev/vulnerability/GHSA-c9pr-q8gx-3mgp](https://osv.dev/vulnerability/GHSA-c9pr-q8gx-3mgp)  
- RustSec: [https://rustsec.org/advisories/](https://rustsec.org/advisories/) ／ RUSTSEC-2022-0091: [https://rustsec.org/advisories/RUSTSEC-2022-0091.html](https://rustsec.org/advisories/RUSTSEC-2022-0091.html)  
- v2 config schema: [https://schema.tauri.app/config](https://schema.tauri.app/config)（現行 $id=2.11.5）。バージョン別パス `/config/<version>` は最新 v2 のエイリアスであり特定版を返さないため、tauri-audit は `schemas/` に vendoring する  
- v2 config reference: [https://v2.tauri.app/reference/config/](https://v2.tauri.app/reference/config/)  
- v2 security: [https://v2.tauri.app/security/](https://v2.tauri.app/security/) ／ CSP: [https://v2.tauri.app/security/csp/](https://v2.tauri.app/security/csp/) ／ Future Work: [https://v2.tauri.app/security/future/](https://v2.tauri.app/security/future/)  
- v1 config: [https://v1.tauri.app/v1/api/config/](https://v1.tauri.app/v1/api/config/) ／ v1 schema: [https://schema.tauri.app/config/1](https://schema.tauri.app/config/1)  
- v1→v2 migration: [https://v2.tauri.app/start/migrate/from-tauri-1/](https://v2.tauri.app/start/migrate/from-tauri-1/)  
- shell plugin: [https://v2.tauri.app/plugin/shell/](https://v2.tauri.app/plugin/shell/) ／ opener plugin: [https://v2.tauri.app/plugin/opener/](https://v2.tauri.app/plugin/opener/) ／ shell deprecated 出典: [https://docs.rs/crate/tauri-plugin-shell/latest/source/src/lib.rs](https://docs.rs/crate/tauri-plugin-shell/latest/source/src/lib.rs)  
- ROS v2 audit PDF: [https://github.com/tauri-apps/tauri/blob/dev/audits/Radically\_Open\_Security-v2-report.pdf](https://github.com/tauri-apps/tauri/blob/dev/audits/Radically_Open_Security-v2-report.pdf)  
- tree-sitter-rust npm: [https://www.npmjs.com/package/tree-sitter-rust](https://www.npmjs.com/package/tree-sitter-rust)  
- SARIF code scanning: [https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning) ／ SARIF category 変更: [https://github.blog/changelog/2025-07-21-code-scanning-will-stop-combining-multiple-sarif-runs-uploaded-in-the-same-sarif-file/](https://github.blog/changelog/2025-07-21-code-scanning-will-stop-combining-multiple-sarif-runs-uploaded-in-the-same-sarif-file/)  
- Victauri（競合参考、目的が異なる）: [https://github.com/4DA-Systems/Victauri](https://github.com/4DA-Systems/Victauri)

