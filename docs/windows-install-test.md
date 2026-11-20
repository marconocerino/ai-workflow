# Windows install test (VAI-108)

Run on a Windows 10/11 PC **signed in as a standard (non-admin) user**. Takes about 15 minutes.
Build the installer first: `npm run dist:win` (or `release:win` for a signed one) and copy
`release/AI-Workflow-Setup-<version>.exe` to the PC.

Write down the result of each step (✓ / ✗ + what happened) and send it back.

## 1. Interactive install, no admin

1. Double-click `AI-Workflow-Setup-<version>.exe`.
   - [ ] No UAC (admin) prompt appears.
   - [ ] The app starts by itself when the install finishes.
   - [ ] Start menu and desktop have an "AI Workflow" shortcut.
2. In the app, Home shows **Database: Encrypted · schema v1**.
3. Settings → AI servers: enter any URL, model and API key. Close the app.
4. Check folders:
   - [ ] `%LOCALAPPDATA%\Programs\AI Workflow\AI Workflow.exe` exists.
   - [ ] `%APPDATA%\AI Workflow` has `settings.json`, `secrets.json`, `data\app.db`, `logs\main.log`.

## 2. Signature (signed builds only)

Right-click the installer → Properties → Digital Signatures.

- [ ] The signer is the expected publisher. Or in PowerShell:
      `Get-AuthenticodeSignature .\AI-Workflow-Setup-<version>.exe | Format-List` → Status `Valid`.
- [ ] Same for `%LOCALAPPDATA%\Programs\AI Workflow\AI Workflow.exe`.

## 3. Upgrade keeps data

Build the next version (bump `version` in package.json) and run its installer.

- [ ] No question about deleting data.
- [ ] The app starts with the settings and API key from step 1.3 still there.

## 4. Interactive uninstall — keep data

Settings → Apps → AI Workflow → Uninstall.

- [ ] "Are you sure" question, then **"Also delete your AI Workflow data?"** with **No** preselected.
- Choose **No**.
- [ ] `%LOCALAPPDATA%\Programs\AI Workflow` is gone; shortcuts are gone.
- [ ] `%APPDATA%\AI Workflow` is still there.
- Reinstall: [ ] the settings and key from step 1.3 are back.

## 5. Interactive uninstall — delete data

Uninstall again, choose **Yes**.

- [ ] Both `%LOCALAPPDATA%\Programs\AI Workflow` and `%APPDATA%\AI Workflow` are gone.

## 6. Silent install and uninstall (Command Prompt, not admin)

```
start /wait AI-Workflow-Setup-<version>.exe /S
echo %ERRORLEVEL%
```

- [ ] Prints `0`; no windows or prompts; the app is installed.

```
start /wait "" "%LOCALAPPDATA%\Programs\AI Workflow\Uninstall AI Workflow.exe" /S
echo %ERRORLEVEL%
```

- [ ] Prints `0`; app removed, **`%APPDATA%\AI Workflow` kept**, no prompts.

Install silently again, then:

```
start /wait "" "%LOCALAPPDATA%\Programs\AI Workflow\Uninstall AI Workflow.exe" /S /DELETEDATA
```

- [ ] App and `%APPDATA%\AI Workflow` both removed, no prompts.

## 7. Feature flags (registry policy)

Needs an admin account for this step (the policy keys are admin-only). Copy `docs/policy/*.reg`.

1. With no policy: Home has **no** Meetings or Agents buttons.
2. As admin, double-click `features-machine.reg` (turns Meetings on). Restart AI Workflow.
   - [ ] Home shows a **Meetings** button; it opens a "Coming soon" page. No Agents button.
   - [ ] `%APPDATA%\AI Workflow\logs\main.log` has `[policy] Features meetings=on agents=off voiceprints=off source=registry`.
3. As the standard user, try `reg add "HKCU\Software\Policies\AI Workflow" /v Agents /t REG_DWORD /d 1`.
   - [ ] "Access is denied" (users can't enable features themselves).
4. As admin, double-click `features-remove-machine.reg`, restart: the Meetings button is gone.

## 8. Tray and start at sign-in

1. Start AI Workflow. [ ] An AI Workflow icon (waveform bars) appears in the notification area
   (it may be under the ^ arrow). Hover: "AI Workflow — Idle".
2. Close the window with X. [ ] The window disappears; the tray icon stays.
3. Click the tray icon. [ ] The window comes back.
4. Right-click the tray icon. [ ] Menu: "Dictation: not active yet", Open AI Workflow, Settings,
   Quit AI Workflow. Choose **Settings** → Settings opens.
5. Settings → Dictation → Startup: turn on **Open AI Workflow when I sign in**. [ ] "Saved".
   [ ] Task Manager → Startup apps lists AI Workflow (enabled).
6. Sign out and back in. [ ] AI Workflow starts with **no window**, only the tray icon.
7. Disable it in Task Manager → Startup apps, reopen Settings → Dictation. [ ] The switch is off.
8. Tray → **Quit AI Workflow**. [ ] Icon disappears; no AI Workflow process in Task Manager.

## 9. Hold Ctrl hotkey

Open Notepad and Word (or any editor). Watch the tray icon tooltip / Settings status card.

1. Settings → Dictation shows **Ready — Hold Ctrl to dictate**.
2. Hold Ctrl alone ~1 s. [ ] Tray turns red-dot (Recording). Release. [ ] Back to Idle.
3. Tap Ctrl quickly. [ ] Nothing happens.
4. In Notepad: Ctrl+C, Ctrl+V, Ctrl+Z, Ctrl+A, Ctrl+S. [ ] All work normally, no recording.
5. Hold Ctrl ~1 s, then press C while still holding. [ ] Recording stops (cancelled); copy works.
6. In a browser: hold Ctrl and scroll the mouse wheel (zoom). [ ] No recording.
7. Shift+Ctrl (Shift first). [ ] No recording.
8. AltGr layout (e.g. French/German keyboard): type @ or € with AltGr. [ ] No recording.
9. Task Manager → end `aiw-key-listener.exe`. [ ] It comes back within a second (Ready again).
   End it 4 times quickly. [ ] Settings says "Ready (Hold Ctrl unavailable)"; Ctrl+Shift+Space
   starts and stops recording; Esc cancels.
10. Windows Security → Protection history. [ ] Nothing about AI Workflow or aiw-key-listener.
11. Settings → Dictation → Change → press Ctrl+Alt+K. [ ] Saved; Toggle mode + Ctrl+Alt+K works.

## 10. Custom folder

```
start /wait AI-Workflow-Setup-<version>.exe /S /D=%USERPROFILE%\Apps\AI Workflow
```

- [ ] Installed there; the app starts from the Start menu shortcut.
