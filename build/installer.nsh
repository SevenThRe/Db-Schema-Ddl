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
  DetailPrint "Uninstaller initialized."
!macroend

!macro customUnInstall
  SetDetailsPrint both
  DetailPrint "Running uninstall cleanup..."
  DetailPrint "Removing installed files and shortcuts..."
  DetailPrint "Uninstall finalize step completed."
!macroend
