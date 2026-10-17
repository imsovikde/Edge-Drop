!macro customInit
  # Instantly terminate any running Edge-Drop or helper processes before install begins
  nsExec::Exec `taskkill /F /IM "Edge-Drop.exe" /T`
  nsExec::Exec `taskkill /F /IM "EdgeDropStartup.exe" /T`
!macroend

!macro customCheckAppRunning
  # Fast, infallible process termination without slow PowerShell cold-starts
  nsExec::Exec `taskkill /F /IM "Edge-Drop.exe" /T`
  nsExec::Exec `taskkill /F /IM "EdgeDropStartup.exe" /T`
  Sleep 300
!macroend

!macro customInstall
  # Ensure all background helpers are clean after install
  nsExec::Exec `taskkill /F /IM "EdgeDropStartup.exe" /T`
!macroend

!macro customUnInit
  # Instantly terminate any running Edge-Drop or helper processes before uninstall begins
  nsExec::Exec `taskkill /F /IM "Edge-Drop.exe" /T`
  nsExec::Exec `taskkill /F /IM "EdgeDropStartup.exe" /T`
!macroend
