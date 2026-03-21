mod commands;
mod constants;
mod ddl;
mod ddl_import;
mod ddl_import_export;
mod excel;
mod models;
mod name_fix;
mod name_fix_apply;
pub mod schema_diff;
mod storage;
mod workbook_templates;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::core_get_app_version,
      commands::core_get_runtime_diagnostics,
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
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
