!macro customInit
  # Instantly terminate any running Edge-Drop or helper processes before install begins
  nsExec::Exec `cmd.exe /C taskkill /F /IM "Edge-Drop.exe" /T >nul 2>&1`
  nsExec::Exec `cmd.exe /C taskkill /F /IM "EdgeDropStartup.exe" /T >nul 2>&1`
!macroend

!macro customCheckAppRunning
  # Fast, infallible process termination without slow PowerShell cold-starts
  nsExec::Exec `cmd.exe /C taskkill /F /IM "Edge-Drop.exe" /T >nul 2>&1`
  nsExec::Exec `cmd.exe /C taskkill /F /IM "EdgeDropStartup.exe" /T >nul 2>&1`
  Sleep 100
!macroend

!macro customInstall
  # Ensure all background helpers are clean after install
  nsExec::Exec `cmd.exe /C taskkill /F /IM "EdgeDropStartup.exe" /T >nul 2>&1`
!macroend

!macro customUnInit
  # Instantly terminate any running Edge-Drop or helper processes before uninstall begins
  nsExec::Exec `cmd.exe /C taskkill /F /IM "Edge-Drop.exe" /T >nul 2>&1`
  nsExec::Exec `cmd.exe /C taskkill /F /IM "EdgeDropStartup.exe" /T >nul 2>&1`
!macroend

!macro customFinishPage
  Function StartAppFast
    # Instantly launch Edge-Drop executable directly via ShellExecute without blocking NSIS or stalling on StdUtils shell link resolution
    ExecShell "open" "$appExe"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartAppFast"
  !insertmacro MUI_PAGE_FINISH
!macroend
