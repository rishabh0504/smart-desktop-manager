# Smart Desktop Manager - Windows NSIS Installer Hooks
# This script is included by the main NSIS installer to add
# a License Agreement page and bootstrap the AI system.

!macro NSIS_HOOK_PREINSTALL
  # Show the license agreement before installation
  !insertmacro MUI_PAGE_LICENSE "$PLUGINSDIR\..\..\..\LICENSE.txt"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Bootstrapping AI System (Checking Ollama & Pulling Model)..."
  # Use nsExec to pipe sdm-installer output to the NSIS log window
  nsExec::ExecToLog '"$INSTDIR\sdm-installer.exe"'
!macroend
