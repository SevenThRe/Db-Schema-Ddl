use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio::process::Command;
use tokio::time::timeout;

use super::{
  DbSqlCopilotAvailability, DbSqlCopilotDiscoveredRuntime, DbSqlCopilotProbeRequest,
  DbSqlCopilotProbeResponse, DbSqlCopilotProvider, DbSqlCopilotResourceState,
  DbSqlCopilotRuntimeState, DbSqlCopilotRuntimeStatusRequest, DbSqlCopilotWarmupState,
};
use crate::{models::DdlSettings, storage};

const OLLAMA_DEFAULT_BASE_URL: &str = "http://127.0.0.1:11434";
const OLLAMA_PROVIDER_KEY: &str = "ollama";
const LLAMA_CPP_PROVIDER_KEY: &str = "llama_cpp_cli";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlCopilotRuntimeTelemetry {
  pub warmup_state: DbSqlCopilotWarmupState,
  pub last_probe_at: Option<String>,
  pub last_latency_ms: Option<u64>,
  pub last_error: Option<String>,
}

pub struct SqlCopilotRuntimeRegistry {
  telemetry: Mutex<HashMap<String, SqlCopilotRuntimeTelemetry>>,
}

impl SqlCopilotRuntimeRegistry {
  pub fn new() -> Self {
    Self {
      telemetry: Mutex::new(HashMap::new()),
    }
  }

  fn get(&self, key: &str) -> Option<SqlCopilotRuntimeTelemetry> {
    self.telemetry.lock().ok()?.get(key).cloned()
  }

  fn put_success(&self, key: &str, latency_ms: u64) {
    if let Ok(mut guard) = self.telemetry.lock() {
      guard.insert(
        key.to_string(),
        SqlCopilotRuntimeTelemetry {
          warmup_state: DbSqlCopilotWarmupState::Ready,
          last_probe_at: Some(Utc::now().to_rfc3339()),
          last_latency_ms: Some(latency_ms),
          last_error: None,
        },
      );
    }
  }

  fn put_warming(&self, key: &str) {
    if let Ok(mut guard) = self.telemetry.lock() {
      let previous = guard.get(key).cloned();
      guard.insert(
        key.to_string(),
        SqlCopilotRuntimeTelemetry {
          warmup_state: DbSqlCopilotWarmupState::Warming,
          last_probe_at: previous.as_ref().and_then(|entry| entry.last_probe_at.clone()),
          last_latency_ms: previous.as_ref().and_then(|entry| entry.last_latency_ms),
          last_error: None,
        },
      );
    }
  }

  fn put_failure(&self, key: &str, message: String) {
    if let Ok(mut guard) = self.telemetry.lock() {
      let previous = guard.get(key).cloned();
      guard.insert(
        key.to_string(),
        SqlCopilotRuntimeTelemetry {
          warmup_state: DbSqlCopilotWarmupState::Failed,
          last_probe_at: Some(Utc::now().to_rfc3339()),
          last_latency_ms: previous.as_ref().and_then(|entry| entry.last_latency_ms),
          last_error: Some(message),
        },
      );
    }
  }
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
  #[serde(default)]
  models: Vec<OllamaModelDescriptor>,
}

#[derive(Debug, Deserialize)]
struct OllamaModelDescriptor {
  name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaGenerateRequest<'a> {
  model: &'a str,
  prompt: &'a str,
  stream: bool,
  options: OllamaGenerateOptions,
  keep_alive: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaGenerateOptions {
  temperature: f64,
  num_predict: i64,
}

#[derive(Debug, Deserialize)]
struct OllamaGenerateResponse {
  #[serde(default)]
  response: String,
}

fn parse_provider(value: &str) -> DbSqlCopilotProvider {
  match value.trim().to_lowercase().as_str() {
    LLAMA_CPP_PROVIDER_KEY => DbSqlCopilotProvider::LlamaCppCli,
    _ => DbSqlCopilotProvider::Ollama,
  }
}

fn provider_key(provider: &DbSqlCopilotProvider) -> &'static str {
  match provider {
    DbSqlCopilotProvider::Ollama => OLLAMA_PROVIDER_KEY,
    DbSqlCopilotProvider::LlamaCppCli => LLAMA_CPP_PROVIDER_KEY,
  }
}

fn saturating_u32(value: usize) -> u32 {
  u32::try_from(value).unwrap_or(u32::MAX)
}

fn configured_model_id(
  settings: &DdlSettings,
  provider: &DbSqlCopilotProvider,
) -> Option<String> {
  match provider {
    DbSqlCopilotProvider::Ollama => trim_to_option(settings.sql_copilot_ollama_model.clone()),
    DbSqlCopilotProvider::LlamaCppCli => trim_to_option(
      settings
        .sql_copilot_llama_model_path
        .clone()
        .and_then(|path| {
          Path::new(&path)
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
        }),
    ),
  }
}

fn runtime_key(settings: &DdlSettings, provider: &DbSqlCopilotProvider) -> String {
  format!(
    "{}:{}",
    provider_key(provider),
    configured_model_id(settings, provider).unwrap_or_default()
  )
}

fn trim_to_option(value: Option<String>) -> Option<String> {
  value.and_then(|entry| {
    let trimmed = entry.trim().to_string();
    if trimmed.is_empty() {
      None
    } else {
      Some(trimmed)
    }
  })
}

fn normalize_base_url(value: &str) -> String {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    OLLAMA_DEFAULT_BASE_URL.to_string()
  } else {
    trimmed.trim_end_matches('/').to_string()
  }
}

fn timeout_duration(settings: &DdlSettings) -> Duration {
  let raw = settings.sql_copilot_request_timeout_ms.max(1000) as u64;
  Duration::from_millis(raw)
}

fn find_executable_on_path(names: &[&str]) -> Option<PathBuf> {
  let path_env = env::var_os("PATH")?;
  for root in env::split_paths(&path_env) {
    for name in names {
      let candidate = root.join(name);
      if candidate.is_file() {
        return Some(candidate);
      }
    }
  }
  None
}

async fn check_ollama_runtime(settings: &DdlSettings) -> DbSqlCopilotDiscoveredRuntime {
  let endpoint = normalize_base_url(&settings.sql_copilot_ollama_base_url);
  let configured_model = trim_to_option(settings.sql_copilot_ollama_model.clone());
  let client = match Client::builder().timeout(timeout_duration(settings)).build() {
    Ok(client) => client,
    Err(error) => {
      return DbSqlCopilotDiscoveredRuntime {
        provider: DbSqlCopilotProvider::Ollama,
        label: "Ollama local service".to_string(),
        available: false,
        configured: configured_model.is_some(),
        availability: DbSqlCopilotAvailability::Error,
        resource_state: DbSqlCopilotResourceState::Error,
        executable_path: None,
        endpoint: Some(endpoint),
        model_id: configured_model,
        discovered_models: vec![],
        message: Some(format!("Failed to build Ollama client: {error}")),
      };
    }
  };

  let request = client.get(format!("{endpoint}/api/tags"));
  let result = timeout(timeout_duration(settings), request.send()).await;
  match result {
    Ok(Ok(response)) => {
      let parsed = response.json::<OllamaTagsResponse>().await;
      match parsed {
        Ok(payload) => {
          let discovered_models = payload
            .models
            .into_iter()
            .map(|entry| entry.name.trim().to_string())
            .filter(|entry| !entry.is_empty())
            .collect::<Vec<_>>();
          let model_ready = configured_model
            .as_ref()
            .map(|model| discovered_models.iter().any(|entry| entry == model))
            .unwrap_or(false);

          DbSqlCopilotDiscoveredRuntime {
            provider: DbSqlCopilotProvider::Ollama,
            label: "Ollama local service".to_string(),
            available: true,
            configured: configured_model.is_some(),
            availability: DbSqlCopilotAvailability::Available,
            resource_state: if configured_model.is_none() {
              DbSqlCopilotResourceState::Unknown
            } else if model_ready {
              DbSqlCopilotResourceState::Ready
            } else {
              DbSqlCopilotResourceState::Missing
            },
            executable_path: None,
            endpoint: Some(endpoint),
            model_id: configured_model,
            discovered_models,
            message: None,
          }
        }
        Err(error) => DbSqlCopilotDiscoveredRuntime {
          provider: DbSqlCopilotProvider::Ollama,
          label: "Ollama local service".to_string(),
          available: false,
          configured: configured_model.is_some(),
          availability: DbSqlCopilotAvailability::Error,
          resource_state: DbSqlCopilotResourceState::Error,
          executable_path: None,
          endpoint: Some(endpoint),
          model_id: configured_model,
          discovered_models: vec![],
          message: Some(format!("Failed to parse Ollama tags response: {error}")),
        },
      }
    }
    Ok(Err(error)) => DbSqlCopilotDiscoveredRuntime {
      provider: DbSqlCopilotProvider::Ollama,
      label: "Ollama local service".to_string(),
      available: false,
      configured: configured_model.is_some(),
      availability: DbSqlCopilotAvailability::NotFound,
      resource_state: DbSqlCopilotResourceState::Missing,
      executable_path: None,
      endpoint: Some(endpoint),
      model_id: configured_model,
      discovered_models: vec![],
      message: Some(format!("Ollama is not reachable: {error}")),
    },
    Err(_) => DbSqlCopilotDiscoveredRuntime {
      provider: DbSqlCopilotProvider::Ollama,
      label: "Ollama local service".to_string(),
      available: false,
      configured: configured_model.is_some(),
      availability: DbSqlCopilotAvailability::Error,
      resource_state: DbSqlCopilotResourceState::Error,
      executable_path: None,
      endpoint: Some(endpoint),
      model_id: configured_model,
      discovered_models: vec![],
      message: Some("Timed out while probing Ollama".to_string()),
    },
  }
}

fn configured_llama_executable(settings: &DdlSettings) -> Option<PathBuf> {
  if let Some(configured) = trim_to_option(settings.sql_copilot_llama_cli_path.clone()) {
    let path = PathBuf::from(configured);
    if path.is_file() {
      return Some(path);
    }
  }

  find_executable_on_path(&["llama-cli.exe", "llama-cli", "llama.cpp.exe", "llama.cpp"])
}

fn configured_llama_model_path(settings: &DdlSettings) -> Option<PathBuf> {
  trim_to_option(settings.sql_copilot_llama_model_path.clone()).map(PathBuf::from)
}

async fn check_llama_runtime(settings: &DdlSettings) -> DbSqlCopilotDiscoveredRuntime {
  let executable = configured_llama_executable(settings);
  let model_path = configured_llama_model_path(settings);
  let configured = executable.is_some() || model_path.is_some();
  let model_id = model_path
    .as_ref()
    .and_then(|path| path.file_name().map(|value| value.to_string_lossy().to_string()));

  let available = if let Some(executable_path) = executable.as_ref() {
    let version_result = timeout(
      timeout_duration(settings),
      Command::new(executable_path).arg("--version").output(),
    )
    .await;
    matches!(version_result, Ok(Ok(output)) if output.status.success())
  } else {
    false
  };

  let resource_state = if model_path.is_none() {
    DbSqlCopilotResourceState::Missing
  } else if model_path.as_ref().is_some_and(|path| path.is_file()) {
    DbSqlCopilotResourceState::Ready
  } else {
    DbSqlCopilotResourceState::Missing
  };
  let model_ready = resource_state == DbSqlCopilotResourceState::Ready;

  DbSqlCopilotDiscoveredRuntime {
    provider: DbSqlCopilotProvider::LlamaCppCli,
    label: "llama.cpp CLI".to_string(),
    available,
    configured,
    availability: if available {
      DbSqlCopilotAvailability::Available
    } else if configured {
      DbSqlCopilotAvailability::NotFound
    } else {
      DbSqlCopilotAvailability::NotConfigured
    },
    resource_state,
    executable_path: executable.map(|path| path.to_string_lossy().to_string()),
    endpoint: None,
    model_id,
    discovered_models: configured_llama_model_path(settings)
      .and_then(|path| path.file_name().map(|value| value.to_string_lossy().to_string()))
      .into_iter()
      .collect(),
    message: if configured && !available {
      Some("llama.cpp CLI executable was not found or failed `--version`.".to_string())
    } else if !model_ready {
      Some("Configured llama.cpp model path is missing.".to_string())
    } else {
      None
    },
  }
}

async fn discover_runtimes(settings: &DdlSettings) -> Vec<DbSqlCopilotDiscoveredRuntime> {
  let (ollama, llama) = tokio::join!(check_ollama_runtime(settings), check_llama_runtime(settings));
  vec![ollama, llama]
}

fn status_summary(
  enabled: bool,
  selected: Option<&DbSqlCopilotDiscoveredRuntime>,
  telemetry: Option<&SqlCopilotRuntimeTelemetry>,
) -> String {
  if !enabled {
    return "SQL copilot runtime is disabled. It will never leave the local machine when enabled.".to_string();
  }

  let Some(runtime) = selected else {
    return "No local SQL copilot provider is selected.".to_string();
  };

  match runtime.availability {
    DbSqlCopilotAvailability::Available => {
      if let Some(entry) = telemetry {
        if entry.warmup_state == DbSqlCopilotWarmupState::Ready {
          return format!(
            "{} is ready for offline probe runs. Output stays advisory until a later SQL-generation phase.",
            runtime.label
          );
        }
      }
      format!(
        "{} is available. Warm it up or run a grounded probe before relying on latency assumptions.",
        runtime.label
      )
    }
    DbSqlCopilotAvailability::Disabled => {
      "SQL copilot runtime is disabled.".to_string()
    }
    DbSqlCopilotAvailability::NotConfigured => {
      format!("{} is selected but not configured with a usable model yet.", runtime.label)
    }
    DbSqlCopilotAvailability::NotFound => {
      format!("{} is configured but not reachable on this machine.", runtime.label)
    }
    DbSqlCopilotAvailability::Error => runtime
      .message
      .clone()
      .unwrap_or_else(|| format!("{} reported an error during discovery.", runtime.label)),
  }
}

fn probe_prompt(prompt_preview: &str, warmup_only: bool) -> String {
  if warmup_only {
    "Reply with READY and nothing else.".to_string()
  } else {
    prompt_preview.to_string()
  }
}

fn build_llama_cli_args(
  model_path: &Path,
  prompt: &str,
  max_output_tokens: i64,
  temperature: f64,
) -> Vec<String> {
  vec![
    "-m".to_string(),
    model_path.to_string_lossy().to_string(),
    "-n".to_string(),
    max_output_tokens.max(1).to_string(),
    "--temp".to_string(),
    temperature.to_string(),
    "--no-display-prompt".to_string(),
    "-p".to_string(),
    prompt.to_string(),
  ]
}

async fn run_ollama_probe(
  settings: &DdlSettings,
  request: &DbSqlCopilotProbeRequest,
) -> Result<(String, Option<String>), String> {
  let endpoint = normalize_base_url(&settings.sql_copilot_ollama_base_url);
  let model = trim_to_option(settings.sql_copilot_ollama_model.clone())
    .ok_or_else(|| "Configure an Ollama model before running the local SQL copilot.".to_string())?;
  let prompt = probe_prompt(&request.prompt_package.prompt_preview, request.warmup_only);
  let client = Client::builder()
    .timeout(timeout_duration(settings))
    .build()
    .map_err(|error| format!("Failed to build Ollama client: {error}"))?;

  let response = client
    .post(format!("{endpoint}/api/generate"))
    .json(&OllamaGenerateRequest {
      model: &model,
      prompt: &prompt,
      stream: false,
      options: OllamaGenerateOptions {
        temperature: settings.sql_copilot_temperature,
        num_predict: settings.sql_copilot_max_output_tokens,
      },
      keep_alive: "15m",
    })
    .send()
    .await
    .map_err(|error| format!("Failed to execute Ollama probe: {error}"))?;

  if !response.status().is_success() {
    return Err(format!("Ollama returned {}", response.status()));
  }

  let payload = response
    .json::<OllamaGenerateResponse>()
    .await
    .map_err(|error| format!("Failed to parse Ollama probe response: {error}"))?;
  Ok((payload.response.trim().to_string(), Some(model)))
}

async fn run_llama_probe(
  settings: &DdlSettings,
  request: &DbSqlCopilotProbeRequest,
) -> Result<(String, Option<String>), String> {
  let executable_path = configured_llama_executable(settings)
    .ok_or_else(|| "llama.cpp CLI executable is not configured or not on PATH.".to_string())?;
  let model_path = configured_llama_model_path(settings)
    .ok_or_else(|| "Configure a llama.cpp model path before running the local SQL copilot.".to_string())?;
  if !model_path.is_file() {
    return Err("Configured llama.cpp model path does not exist.".to_string());
  }

  let prompt = probe_prompt(&request.prompt_package.prompt_preview, request.warmup_only);
  let args = build_llama_cli_args(
    &model_path,
    &prompt,
    settings.sql_copilot_max_output_tokens,
    settings.sql_copilot_temperature,
  );
  let output = timeout(
    timeout_duration(settings),
    Command::new(&executable_path).args(&args).output(),
  )
  .await
  .map_err(|_| "Timed out while waiting for llama.cpp CLI.".to_string())?
  .map_err(|error| format!("Failed to launch llama.cpp CLI: {error}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(if stderr.is_empty() {
      format!("llama.cpp CLI exited with {}", output.status)
    } else {
      stderr
    });
  }

  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let model_id = model_path
    .file_name()
    .map(|value| value.to_string_lossy().to_string());
  Ok((stdout, model_id))
}

pub async fn db_sql_copilot_runtime_state(
  app: &AppHandle,
  registry: &SqlCopilotRuntimeRegistry,
  _request: DbSqlCopilotRuntimeStatusRequest,
) -> Result<DbSqlCopilotRuntimeState, String> {
  let settings = storage::get_settings(app).unwrap_or_default();
  let provider = parse_provider(&settings.sql_copilot_provider);
  let discovered_runtimes = discover_runtimes(&settings).await;
  let selected = discovered_runtimes
    .iter()
    .find(|runtime| runtime.provider == provider);
  let key = runtime_key(&settings, &provider);
  let telemetry = registry.get(&key);

  let availability = if !settings.sql_copilot_enabled {
    DbSqlCopilotAvailability::Disabled
  } else {
    selected
      .map(|runtime| runtime.availability.clone())
      .unwrap_or(DbSqlCopilotAvailability::NotConfigured)
  };

  let warmup_state = if !settings.sql_copilot_enabled {
    DbSqlCopilotWarmupState::Idle
  } else if let Some(entry) = telemetry.as_ref() {
    entry.warmup_state.clone()
  } else if availability == DbSqlCopilotAvailability::Available {
    DbSqlCopilotWarmupState::Idle
  } else {
    DbSqlCopilotWarmupState::Failed
  };

  Ok(DbSqlCopilotRuntimeState {
    enabled: settings.sql_copilot_enabled,
    provider: provider.clone(),
    availability,
    warmup_state,
    privacy_mode: "offline_local_only".to_string(),
    supports_probe: settings.sql_copilot_enabled,
    configured_model_id: configured_model_id(&settings, &provider),
    status_summary: status_summary(settings.sql_copilot_enabled, selected, telemetry.as_ref()),
    last_latency_ms: telemetry.as_ref().and_then(|entry| entry.last_latency_ms),
    last_probe_at: telemetry.as_ref().and_then(|entry| entry.last_probe_at.clone()),
    last_error: telemetry.as_ref().and_then(|entry| entry.last_error.clone()),
    discovered_runtimes,
  })
}

pub async fn db_sql_copilot_probe(
  app: &AppHandle,
  registry: &SqlCopilotRuntimeRegistry,
  request: DbSqlCopilotProbeRequest,
) -> Result<DbSqlCopilotProbeResponse, String> {
  let settings = storage::get_settings(app).unwrap_or_default();
  if !settings.sql_copilot_enabled {
    return Err("Enable SQL copilot runtime before running a local probe.".to_string());
  }

  let provider = parse_provider(&settings.sql_copilot_provider);
  let key = runtime_key(&settings, &provider);
  registry.put_warming(&key);
  let started_at = Instant::now();
  let result = match provider {
    DbSqlCopilotProvider::Ollama => run_ollama_probe(&settings, &request).await,
    DbSqlCopilotProvider::LlamaCppCli => run_llama_probe(&settings, &request).await,
  };

  match result {
    Ok((output_text, model_id)) => {
      let latency_ms = started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
      let completion_char_count = saturating_u32(output_text.chars().count());
      registry.put_success(&key, latency_ms);
      Ok(DbSqlCopilotProbeResponse {
        provider,
        model_id,
        output_text,
        latency_ms,
        prompt_char_count: saturating_u32(request.prompt_package.prompt_preview.chars().count()),
        completion_char_count,
        executed_at: Utc::now().to_rfc3339(),
        offline: true,
        warnings: if request.warmup_only {
          vec!["Warmup probe finished. Treat latency as runtime evidence, not model quality evidence.".to_string()]
        } else {
          vec![
            "Model output is advisory only in Phase 52 and is not executed automatically.".to_string(),
          ]
        },
      })
    }
    Err(error) => {
      registry.put_failure(&key, error.clone());
      Err(error)
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn provider_parser_defaults_to_ollama() {
    assert_eq!(parse_provider("ollama"), DbSqlCopilotProvider::Ollama);
    assert_eq!(parse_provider("llama_cpp_cli"), DbSqlCopilotProvider::LlamaCppCli);
    assert_eq!(parse_provider("unknown"), DbSqlCopilotProvider::Ollama);
  }

  #[test]
  fn llama_cli_args_include_prompt_and_model() {
    let model_path = PathBuf::from("C:/models/sql.gguf");
    let args = build_llama_cli_args(&model_path, "hello", 128, 0.2);
    assert!(args.contains(&"-m".to_string()));
    assert!(args.contains(&"hello".to_string()));
    assert!(args.contains(&"128".to_string()));
  }
}
