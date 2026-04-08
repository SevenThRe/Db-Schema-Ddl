mod builtin_extensions;
mod db_connector;
mod commands;
mod constants;
mod ddl;
mod ddl_import;
mod ddl_import_export;
mod excel;
pub mod extensions;
mod models;
mod name_fix;
mod name_fix_apply;
pub mod schema_diff;
mod storage;
mod workbook_templates;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .on_page_load(|webview, _payload| {
      let _ = webview.eval(
        "window.__DB_SCHEMA_DDL_TAURI_BRIDGE_READY__ = true; globalThis.isTauri = true;",
      );
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 拡張機能プロセスマネージャーを managed state として登録
      let data_dir = app.path().app_data_dir()?;
      let ext_manager = Arc::new(extensions::process::ProcessManager::new(&data_dir));
      app.manage(ext_manager);

      // DB クエリ実行用 managed state を登録
      use std::collections::HashMap;
      use std::sync::Mutex;
      let pool_registry = Arc::new(db_connector::DbPoolRegistry {
        pools: Mutex::new(HashMap::new()),
      });
      let cancel_registry = Arc::new(db_connector::CancellationRegistry {
        tokens: Mutex::new(HashMap::new()),
      });
      let grid_edit_plan_registry = Arc::new(db_connector::grid_edit::GridEditPlanRegistry::new());
      app.manage(pool_registry);
      app.manage(cancel_registry);
      app.manage(grid_edit_plan_registry);

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::core_get_app_version,
      commands::core_get_runtime_diagnostics,
      commands::core_get_process_metrics,
      commands::core_write_binary_file,
      commands::files_list,
      commands::files_list_templates,
      commands::files_create_from_template,
      commands::files_import_excel,
      commands::files_remove,
      commands::files_get_sheets,
      commands::files_get_search_index,
      commands::files_get_table_info,
      commands::files_get_sheet_data,
      commands::files_parse_region,
      commands::ddl_generate,
      commands::ddl_generate_by_reference,
      commands::ddl_export_zip,
      commands::ddl_export_zip_by_reference,
      commands::settings_get,
      commands::settings_update,
      commands::ddl_import_preview,
      commands::ddl_import_export_workbook,
      commands::name_fix_preview,
      commands::name_fix_apply,
      commands::diff_preview,
      commands::diff_confirm,
      commands::diff_alter_preview,
      // 拡張機能コマンド
      extensions::commands::ext_list,
      extensions::commands::ext_get,
      extensions::commands::ext_fetch_catalog,
      extensions::commands::ext_install,
      extensions::commands::ext_uninstall,
      extensions::commands::ext_start,
      extensions::commands::ext_stop,
      extensions::commands::ext_health,
      extensions::commands::ext_call,
      extensions::commands::ext_list_all,
      extensions::commands::ext_set_enabled,
      extensions::commands::ext_get_disabled,
      commands::ext_list_builtin,
      commands::enum_gen_preview,
      commands::enum_gen_export,
      commands::update_check,
      commands::update_download_and_install,
      db_connector::commands::db_conn_list,
      db_connector::commands::db_conn_save,
      db_connector::commands::db_conn_delete,
      db_connector::commands::db_conn_test,
      db_connector::commands::db_introspect,
      db_connector::commands::db_list_schemas,
      db_connector::commands::db_diff,
      db_connector::commands::db_export_rows,
      db_connector::grid_edit::db_grid_prepare_commit,
      db_connector::grid_edit::db_grid_commit,
      db_connector::query::db_query_execute,
      db_connector::query::db_query_cancel,
      db_connector::query::db_query_fetch_more,
      db_connector::query::db_preview_dangerous_sql,
      db_connector::explain::db_query_explain,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
