!include LogicLib.nsh
!include nsDialogs.nsh

!ifdef BUILD_UNINSTALLER
  Var un.DeleteDataCheckbox
  Var un.DeleteAllDataRequested

  !macro customUnWelcomePage
    UninstPage custom un.ConfirmDataCleanupPageCreate un.ConfirmDataCleanupPageLeave
  !macroend

  Function un.ConfirmDataCleanupPageCreate
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 12u "Uninstall options"
    Pop $1
    ${NSD_CreateLabel} 0 16u 100% 26u "Choose whether to also remove local data (settings/cache/database/uploads)."
    Pop $1
    ${NSD_CreateCheckbox} 0 46u 100% 12u "Remove all local application data (cannot be undone)"
    Pop $un.DeleteDataCheckbox
    ${NSD_SetState} $un.DeleteDataCheckbox ${BST_UNCHECKED}

    nsDialogs::Show
  FunctionEnd

  Function un.ConfirmDataCleanupPageLeave
    ${NSD_GetState} $un.DeleteDataCheckbox $un.DeleteAllDataRequested
    ${If} $un.DeleteAllDataRequested == ${BST_CHECKED}
      StrCpy $un.DeleteAllDataRequested "1"
    ${Else}
      StrCpy $un.DeleteAllDataRequested "0"
    ${EndIf}
  FunctionEnd
!endif

!macro customHeader
  ; Keep install details visible so users can see exact progress.
  ShowInstDetails show
  ShowUnInstDetails show
!macroend

!macro customInit
  SetDetailsPrint both
  DetailPrint "Installer initialized."
  DetailPrint "Installer version: ${VERSION}"
  DetailPrint "Default target: $INSTDIR"

  ; Reuse previous install location when available (important for silent auto-update).
  ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${if} $R1 == ""
    ReadRegStr $R1 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${endif}
  ${if} $R1 != ""
    StrCpy $INSTDIR $R1
    DetailPrint "Reusing previous install location: $INSTDIR"
  ${endif}

  ReadRegStr $R0 HKLM "${INSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${if} $R0 != ""
    DetailPrint "Detected existing all-users installation: $R0"
  ${else}
    ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${if} $R0 != ""
      DetailPrint "Detected existing current-user installation: $R0"
    ${else}
      DetailPrint "No previous installation detected."
    ${endif}
  ${endif}
!macroend

!macro customInstallMode
  ; Emit chosen install mode in details panel.
  SetDetailsPrint both
  ${if} $isForceMachineInstall == "1"
    DetailPrint "Install mode selected: All Users (per-machine)."
  ${else}
    ${if} $isForceCurrentInstall == "1"
      DetailPrint "Install mode selected: Current User (per-user)."
    ${else}
      DetailPrint "Install mode selected automatically."
    ${endif}
  ${endif}
!macroend

!macro customInstall
  SetDetailsPrint both
  DetailPrint "Preparing to finalize installation steps..."
  DetailPrint "Install directory: $INSTDIR"
  IfFileExists "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" 0 +2
    DetailPrint "Existing executable detected in target directory."
  DetailPrint "Writing uninstall information..."
  DetailPrint "Refreshing shortcuts and registry entries..."
  DetailPrint "Installation finalize step completed."
!macroend

!macro customUnInit
  SetDetailsPrint both
  SetOutPath "$TEMP"
  StrCpy $un.DeleteAllDataRequested "0"
  DetailPrint "Uninstaller initialized."
!macroend

!macro customUnInstall
  SetDetailsPrint both
  DetailPrint "Running uninstall cleanup..."
  DetailPrint "Removing installed files and shortcuts..."

  ${if} $un.DeleteAllDataRequested == "1"
    DetailPrint "Removing app data requested by user..."
    SetShellVarContext current
    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    !endif
    RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$LOCALAPPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
    !endif
  ${endif}

  ; IMPORTANT:
  ; During auto-update, uninstall + install happens in one flow.
  ; A delayed cleanup task can race and delete freshly installed files.
  ; So only run aggressive install-dir cleanup for true uninstall (not update).
  ${if} ${isUpdated}
    DetailPrint "Update flow detected. Skip delayed install-directory cleanup."
  ${else}
    ; Best-effort cleanup for empty install directory that can remain
    ; because uninstaller executable is still in use during uninstall.
    RMDir "$INSTDIR"
    IfFileExists "$INSTDIR\*.*" still_exists removed_now

    removed_now:
      DetailPrint "Install directory removed."
      Goto cleanup_done

    still_exists:
      DetailPrint "Install directory still present. Scheduling delayed cleanup..."
      StrCpy $R0 "$TEMP\dbschema_cleanup_install_dir.bat"
      FileOpen $R1 $R0 w
      FileWrite $R1 "@echo off$\r$\n"
      FileWrite $R1 "cd /d %TEMP%$\r$\n"
      FileWrite $R1 "ping 127.0.0.1 -n 4 >nul$\r$\n"
      FileWrite $R1 "rmdir /S /Q $\"$INSTDIR$\"$\r$\n"
      FileWrite $R1 "del /f /q $\"%~f0$\"$\r$\n"
      FileClose $R1
      Exec '"$SYSDIR\cmd.exe" /C start "" /MIN "$TEMP\dbschema_cleanup_install_dir.bat"'
      ; Do not set reboot flag for this app.
      ; If immediate delete fails, deferred batch cleanup handles it.
      RMDir /r "$INSTDIR"
  ${endif}

  cleanup_done:
  SetRebootFlag false
  DetailPrint "Uninstall finalize step completed."
!macroend
