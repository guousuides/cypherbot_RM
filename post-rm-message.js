diff --git a/.github/workflows/post-rm.yml b/.github/workflows/post-rm.yml
index e5f298f..d4beca9 100644
--- a/.github/workflows/post-rm.yml
+++ b/.github/workflows/post-rm.yml
@@ -2,30 +2,43 @@ name: RM定例のSlack自動投稿
 
 on:
   schedule:
-    # 毎週 月曜(1)・木曜(4) の 13:07 JST (= 04:07 UTC) に投稿します
-    # 21:00開始の定例会よりだいぶ前倒しで、事前に議事録へアジェンダを書き込む時間を確保しています。
+    # 投稿そのものはSlackの「予約投稿」で行います(投稿時刻は下の POST_TIMES)。
+    # このcronは「予約を入れに行く時刻」で、毎日 3:07 / 9:07 / 15:07 / 21:07 JST に動きます。
+    # 毎回、7日先までの投稿をまとめて予約し、当番表の最新内容で予約を作り直すので、
+    # GitHub Actionsの実行が数時間遅れたり飛ばされたりしても、投稿時刻はずれません。
     # 分を0ではなく7にずらしているのは、GitHub側で毎時00分に実行が集中して遅延しやすいのを避けるためです。
-    #
-    # 変更したい場合はここを書き換えてください。cronはUTC(協定世界時)基準なので、
-    # 「JSTの時刻 - 9時間」がUTCの時刻になります。
-    #     書式: 分 時 * * 曜日(0=日,1=月,2=火,3=水,4=木,5=金,6=土。カンマ区切りで複数指定可)
-    - cron: '7 1,5,9 * * 1,4'
+    # cronはUTC(協定世界時)基準なので「JSTの時刻 - 9時間」で書きます。
+    - cron: '7 0,6,12,18 * * *'
   workflow_dispatch:
     inputs:
       dry_run:
-        description: 'dry run(チェックすると実際には投稿せず、内容だけログに出す)'
+        description: 'dry run(チェックすると実際には予約せず、内容だけログに出す)'
         type: boolean
         default: false
 
+# 同時に2つ実行されて二重に予約しないようにする
+concurrency:
+  group: rm-post
+  cancel-in-progress: false
+
 jobs:
   post:
     runs-on: ubuntu-latest
+    timeout-minutes: 10
     steps:
-      - uses: actions/checkout@v4
-      - uses: actions/setup-node@v4
+      - uses: actions/checkout@v7
+      - uses: actions/setup-node@v7
         with:
-          node-version: '20'
+          node-version: '24'
       - run: npm install
+
+      # 予約・投稿済みの記録を前回の実行から引き継ぐ(二重投稿・投稿漏れの防止用)
+      - uses: actions/cache/restore@v6
+        with:
+          path: .rm-state
+          key: rm-state-${{ github.run_id }}
+          restore-keys: rm-state-
+
       - run: node post-rm-message.js
         env:
           SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
@@ -34,3 +47,11 @@ jobs:
           MEET_URL: ${{ secrets.MEET_URL }}
           SCHEDULE_CSV_URL: ${{ secrets.SCHEDULE_CSV_URL }}
           DRY_RUN: ${{ inputs.dry_run }}
+          POST_WEEKDAYS: '1,4'          # 投稿する曜日(JST。0=日,1=月,2=火,3=水,4=木,5=金,6=土)
+          POST_TIMES: '10:00,13:00'     # 投稿時刻(JST。カンマ区切りで複数可)
+
+      - uses: actions/cache/save@v6
+        if: always() && hashFiles('.rm-state/done.json') != ''
+        with:
+          path: .rm-state
+          key: rm-state-${{ github.run_id }}
diff --git a/.gitignore b/.gitignore
index c2658d7..a6fe233 100644
--- a/.gitignore
+++ b/.gitignore
@@ -1 +1,2 @@
 node_modules/
+.rm-state/
diff --git a/README.md b/README.md
index f858903..601725f 100644
--- a/README.md
+++ b/README.md
@@ -92,14 +92,14 @@ RM定例の「議事録リンク・Meetリンク・本日の進行担当（主
 
 ## 4. 動作確認（dry run）
 
-実際には投稿せず、投稿内容だけをログで確認できます。
+実際には予約せず、投稿内容だけをログで確認できます。
 
 1. リポジトリの「Actions」タブ → 左のワークフロー名 → 右上「Run workflow」
 2. **`dry_run` にチェックを入れて**実行
 3. 実行をクリック → ジョブ「post」→ ステップ「Run node post-rm-message.js」を開く
 4. 「=== DRY RUN ===」の下に、投稿予定のメッセージ（JSON）が出ます
 
-チェックを外して実行すると、実際にSlackへ投稿されます。
+チェックを外して実行すると、実際にSlackへ予約が入ります（投稿時刻を過ぎていると予約されません）。
 
 ログのメッセージの意味:
 
@@ -114,18 +114,25 @@ RM定例の「議事録リンク・Meetリンク・本日の進行担当（主
 
 ## 5. 配信スケジュール
 
-`.github/workflows/post-rm.yml` の `cron` で指定します。**UTC基準**なので、日本時間から9時間引いた値を書きます。
+投稿は**Slackの予約投稿**で行います。GitHub Actionsは「予約を入れに行く」だけです。
 
-```yaml
-- cron: '7 4 * * 1,4'   # 毎週 月・木 13:07 JST（= 04:07 UTC）
-```
+| 設定（`.github/workflows/post-rm.yml`） | 既定値 | 意味 |
+|---|---|---|
+| `POST_WEEKDAYS` | `'1,4'` | 投稿する曜日（JST。0=日, 1=月, ..., 6=土） |
+| `POST_TIMES` | `'10:00,13:00'` | 投稿時刻（JST。カンマ区切りで複数可） |
+| `cron` | `'7 0,6,12,18 * * *'` | 予約を入れに行く時刻（毎日 3:07 / 9:07 / 15:07 / 21:07 JST。UTC基準で書く） |
+
+### 動き
+1. 毎回の実行で、**7日先までの投稿をすべてSlackに予約**します。すでに予約があれば、当番表の最新内容で作り直します（新しい予約を入れてから古い予約を消すので、予約が0件になる瞬間はありません）。
+2. 万一、投稿時刻までに一度も予約できなかった投稿があれば、次の実行で**遅れてでも即時投稿**します（2日以内のもの）。
+3. 予約・投稿済みの記録は、GitHub Actionsのキャッシュ（`rm-state-...`）に残して次の実行に引き継ぎます。
 
-- 書式: `分 時 * * 曜日`（0=日, 1=月, ..., 6=土。カンマ区切りで複数可）
-- 1日に複数回: `'7 1,3,6 * * *'`（毎日 10:07, 12:07, 15:07 JST）
-- 分を0にしていないのは、毎時00分にGitHub側の実行が集中して遅延しやすいためです。
+当番表の変更は、投稿日の朝9:07頃の実行までに入れれば、10:00・13:00の両方の投稿に反映されます（実行が遅れた場合はその分ずれます）。
 
-### 既知の制限（重要）
-GitHub Actionsのスケジュール実行は、**指定時刻ぴったりに実行される保証がありません**。混雑時に数時間遅れることがあり、実際に13:07指定が19:52に実行された例がありました。時刻の正確さが必要な場合は、外部のcronサービスからGitHub APIの `workflow_dispatch` を呼び出す方式に切り替えてください（コード側の変更は不要です）。
+### 既知の制限
+- GitHub Actionsのスケジュール実行は数時間遅れたり、飛ばされたりすることがあります。予約は7日前から1日4回入れ直すので、投稿時刻に影響が出るのは「GitHub Actionsが1週間近くまったく動かなかった」場合だけです。
+- 初めて動かしたとき（記録がまだ無いとき）は、すでに過ぎた投稿の遅れ投稿はしません（投稿済みか判断できず、二重投稿になるため）。
+- 予約・投稿に失敗した実行は「失敗」になり、GitHubからメールが届きます。
 
 ---
 
@@ -136,3 +143,4 @@ GitHub Actionsのスケジュール実行は、**指定時刻ぴったりに実
 - Slack Appの管理は https://api.slack.com/apps から行います。引き継ぎ先の人を「Collaborator」に追加すると、その人がトークンの確認・再発行をできます。
 - トークンの値をチャットやメールに平文で貼らないでください。引き継ぎ時はトークンを再発行し、受け取った人が自分でSecretsに登録するのが安全です。
 - 日々の運用（当番表の更新）はスプレッドシートの編集だけで完結します。
+- **60日間リポジトリにコミットがないと、GitHubがスケジュール実行を自動で止めます。** 止まるとGitHubからメールが届くので、Actionsタブでワークフローを「Enable」し直してください（止まっても、すでに入っている7日分の予約はそのまま投稿されます）。
diff --git a/post-rm-message.js b/post-rm-message.js
index df1655a..954b376 100644
--- a/post-rm-message.js
+++ b/post-rm-message.js
@@ -1,4 +1,4 @@
-import { readFileSync } from 'fs';
+import { readFileSync, writeFileSync, mkdirSync } from 'fs';
 import { WebClient } from '@slack/web-api';
 
 const {
@@ -14,6 +14,14 @@ const {
 
 const isDryRun = DRY_RUN === '1' || DRY_RUN === 'true';
 
+// 投稿する曜日(JST。0=日,1=月,...,6=土)と、投稿時刻(JST, HH:MM。カンマ区切りで複数可)
+const POST_WEEKDAYS = (process.env.POST_WEEKDAYS || '1,4').split(',').map((s) => Number(s.trim()));
+const POST_TIMES = (process.env.POST_TIMES || '10:00,13:00').split(',').map((s) => s.trim());
+// 何日先までの投稿を予約しておくか(Slackの予約は最大120日先まで可能)
+const LOOKAHEAD_DAYS = Number(process.env.LOOKAHEAD_DAYS || 7);
+// 予約・投稿済みの投稿枠を記録するファイル(ワークフロー側でActionsのキャッシュに保存して引き継ぐ)
+const STATE_FILE = '.rm-state/done.json';
+
 // ---- 必須環境変数チェック ----
 if (!isDryRun) {
   const missing = [];
@@ -202,8 +210,7 @@ function resolveMention(name, members) {
 }
 
 // ---- メイン処理 ----
-async function main() {
-  const jstParts = getJstDateParts();
+async function buildPayload(jstParts) {
   const todayYmd = toYmd(jstParts);
   const dateLabel = formatJstDateLabel(jstParts);
   const label = MEETING_LABEL || '定例会';
@@ -273,15 +280,116 @@ async function main() {
     blocks,
   };
 
-  if (isDryRun) {
-    console.log('=== DRY RUN: 実際には投稿しません ===');
-    console.log(JSON.stringify(payload, null, 2));
-    return;
+  return payload;
+}
+
+// ---- 投稿枠(日付×時刻)の計算 ----
+const JST_WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
+
+function jstEpoch(parts, hhmm) {
+  const [h, m] = hhmm.split(':').map(Number);
+  return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), h - 9, m) / 1000);
+}
+
+// 前日から LOOKAHEAD_DAYS 日先までの投稿枠を列挙する
+function listSlots(nowSec) {
+  const slots = [];
+  for (let d = -1; d <= LOOKAHEAD_DAYS; d++) {
+    const parts = getJstDateParts(new Date((nowSec + d * 86400) * 1000));
+    if (!POST_WEEKDAYS.includes(JST_WEEKDAY_INDEX[parts.weekday])) continue;
+    for (const time of POST_TIMES) {
+      slots.push({ parts, time, postAt: jstEpoch(parts, time), key: `${toYmd(parts)} ${time}` });
+    }
+  }
+  return slots;
+}
+
+function loadState() {
+  try {
+    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
+  } catch {
+    return null; // 初回、またはキャッシュが無い
+  }
+}
+
+function saveState(state) {
+  // 古い記録は消す(10日より前)
+  const limit = Math.floor(Date.now() / 1000) - 10 * 86400;
+  for (const [k, v] of Object.entries(state)) if (v < limit) delete state[k];
+  mkdirSync('.rm-state', { recursive: true });
+  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
+}
+
+// ---- メイン処理 ----
+// 1. これから先(LOOKAHEAD_DAYS日以内)の投稿枠をすべてSlackに予約する。
+//    すでに予約があれば、当番表の最新内容で予約を作り直す(新しい予約を入れてから古い予約を消すので、0件になる瞬間はない)。
+// 2. 投稿時刻を過ぎているのに、一度も予約・投稿できていなかった枠があれば、遅れてでも即時投稿する。
+async function main() {
+  const nowSec = Math.floor(Date.now() / 1000);
+  const slots = listSlots(nowSec);
+  const state = loadState();
+  const newState = { ...(state || {}) };
+  const client = isDryRun ? null : new WebClient(SLACK_BOT_TOKEN);
+  let failed = false;
+
+  let existing = [];
+  if (!isDryRun) {
+    const listed = await client.chat.scheduledMessages.list({ channel: RM_CHANNEL_ID, oldest: String(nowSec) });
+    existing = listed.scheduled_messages || [];
+  }
+
+  for (const slot of slots) {
+    try {
+      // ---- まだ来ていない投稿枠 → 予約 ----
+      if (slot.postAt - nowSec > 120) {
+        const olds = existing.filter((m) => m.post_at === slot.postAt);
+        // 投稿直前(10分以内)の予約は作り直さない
+        if (olds.length > 0 && slot.postAt - nowSec < 600) {
+          console.log(`[${slot.key}] 予約済み(まもなく投稿)`);
+          newState[slot.key] = slot.postAt;
+          continue;
+        }
+        const payload = await buildPayload(slot.parts);
+        if (isDryRun) {
+          console.log(`=== DRY RUN: [${slot.key}] に予約する内容(実際には予約しません) ===`);
+          console.log(JSON.stringify(payload, null, 2));
+          continue;
+        }
+        const result = await client.chat.scheduleMessage({ ...payload, post_at: slot.postAt });
+        newState[slot.key] = slot.postAt;
+        console.log(`[${slot.key}] Slackに予約しました: ${result.scheduled_message_id}`);
+        for (const m of olds) {
+          await client.chat.deleteScheduledMessage({ channel: RM_CHANNEL_ID, scheduled_message_id: m.id });
+          console.log(`[${slot.key}] 古い予約を削除しました: ${m.id}`);
+        }
+        continue;
+      }
+
+      // ---- 投稿時刻を過ぎた(または直前の)投稿枠 → 予約・投稿の記録がなければ即時投稿 ----
+      if (nowSec - slot.postAt > 2 * 86400) continue; // 2日以上前の枠は対象外
+      if (newState[slot.key]) continue; // 予約・投稿済み
+      if (state === null) {
+        // 記録が残っていない(初回など)ときは、すでに投稿済みかどうか判断できないので二重投稿を避けて何もしない
+        console.warn(`[${slot.key}] 予約・投稿の記録がないため、遅れ投稿は行いません(初回実行の場合は正常です)`);
+        continue;
+      }
+      const payload = await buildPayload(slot.parts);
+      if (isDryRun) {
+        console.log(`=== DRY RUN: [${slot.key}] 予約できていなかったため即時投稿する内容(実際には投稿しません) ===`);
+        console.log(JSON.stringify(payload, null, 2));
+        continue;
+      }
+      const result = await client.chat.postMessage(payload);
+      newState[slot.key] = slot.postAt;
+      console.warn(`[${slot.key}] 予約できていなかったため、遅れて即時投稿しました: ${result.ts}`);
+    } catch (err) {
+      failed = true;
+      console.error(`[${slot.key}] 予約・投稿に失敗しました:`, err.data?.error || err.message);
+    }
   }
 
-  const client = new WebClient(SLACK_BOT_TOKEN);
-  const result = await client.chat.postMessage(payload);
-  console.log('Slackへの投稿に成功しました:', result.ts);
+  if (!isDryRun) saveState(newState);
+  if (failed) process.exit(1);
 }
 
 main().catch((err) => {
