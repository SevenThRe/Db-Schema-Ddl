!macro customHeader
  ; Keep install details visible so users can see exact progress.
  ShowInstDetails show
  ShowUnInstDetails show
!macroend

!macro customInit
  DetailPrint "Installer initialized."
!macroend

!macro customInstallMode
  ; Emit chosen install mode in details panel.
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
  DetailPrint "Install directory: $INSTDIR"
  DetailPrint "Writing uninstall information..."
  DetailPrint "Installation finalize step completed."
!macroend

!macro customUnInstall
  DetailPrint "Running uninstall cleanup..."
  DetailPrint "Uninstall finalize step completed."
!macroend
