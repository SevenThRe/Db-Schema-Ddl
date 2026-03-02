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
  DetailPrint "Uninstaller initialized."
!macroend

!macro customUnInstall
  SetDetailsPrint both
  DetailPrint "Running uninstall cleanup..."
  DetailPrint "Removing installed files and shortcuts..."
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
    RMDir /r /REBOOTOK "$INSTDIR"

  cleanup_done:
  DetailPrint "Uninstall finalize step completed."
!macroend
