// ext_call プロキシ — Tauri invoke → Sidecar HTTP 転送
//
// フロントエンドから `invoke("ext_call", { id, method, params })` を受け取り、
// 実行中サイドカーの `POST http://127.0.0.1:{port}/ext_call` に転送する。
//
// サイドカーが返す JSON:
//   { "ok": true,  "result": <any>, "error": null }
//   { "ok": false, "result": null,  "error": "<message>" }

use super::{ExtResult, ExtensionError};
use super::process::ProcessManager;

// ──────────────────────────────────────────────
// リクエストボディ（サイドカー向け）
// ──────────────────────────────────────────────

#[derive(serde::Serialize)]
struct ExtCallBody<'a> {
    method: &'a str,
    params: &'a serde_json::Value,
}

// ──────────────────────────────────────────────
// プロキシ本体
// ──────────────────────────────────────────────

/// 拡張機能のサイドカーに RPC を転送し、生 JSON 結果を返す
pub async fn ext_call(
    manager: &ProcessManager,
    extension_id: &str,
    method: &str,
    params: serde_json::Value,
) -> ExtResult<serde_json::Value> {
    // サイドカーのポートを取得（未起動なら NotRunning エラー）
    let proc = manager
        .get_running(extension_id)
        .await
        .ok_or_else(|| ExtensionError::NotRunning(extension_id.to_string()))?;

    let url = format!("http://127.0.0.1:{}/ext_call", proc.port);
    let body = ExtCallBody { method, params: &params };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        // サイドカー側のロジック実行を考慮して 30 秒タイムアウト
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| ExtensionError::Network(e.to_string()))?;

    if !response.status().is_success() {
        return Err(ExtensionError::Network(format!(
            "サイドカーが HTTP {} を返しました",
            response.status()
        )));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| ExtensionError::Network(e.to_string()))?;

    // サイドカーがアプリレベルエラーを返した場合はそのまま伝播
    if let Some(false) = result.get("ok").and_then(|v| v.as_bool()) {
        let msg = result
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("不明なエラー")
            .to_string();
        return Err(ExtensionError::Internal(msg));
    }

    Ok(result)
}
