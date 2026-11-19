; AI Workflow — custom NSIS steps (VAI-108, D-015). Included by electron-builder (nsis.include).
;
; Uninstall: offers to keep or delete the user's data (%APPDATA%\AI Workflow: settings,
; encrypted keys, database, logs).
;   - Interactive uninstall: asks; the default answer is "No" (keep the data).
;   - Silent uninstall (/S): keeps the data, unless /DELETEDATA is passed.
;   - Update (the old version's uninstaller runs with --updated): never asks, never deletes.
;
; Note: the one-click uninstaller switches itself to silent mode after its own "Are you sure?"
; question, so "did the user pass /S?" is read from the command line, not from ${Silent}.

!macro aiwDeleteUserData
  ; Electron keeps user data per user, even for per-machine installs.
  SetShellVarContext current
  RMDir /r "$APPDATA\${APP_FILENAME}"
  !ifdef APP_PRODUCT_FILENAME
    RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
  !endif
  !ifdef APP_PACKAGE_NAME
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
  !endif
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/DELETEDATA" $R1
    ${ifNot} ${Errors}
      !insertmacro aiwDeleteUserData
    ${else}
      ClearErrors
      ${GetOptions} $R0 "/S" $R1
      ${if} ${Errors}
        ; Interactive: no /SD, so the question shows even though the uninstaller is now silent.
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
          "Also delete your AI Workflow data?$\r$\n$\r$\nThis removes your settings, saved API keys, dictations, meeting notes and logs from this computer. Choose No to keep them for a later reinstall." \
          IDNO aiwKeepData
        !insertmacro aiwDeleteUserData
        aiwKeepData:
      ${endif}
    ${endif}
  ${endif}
!macroend
