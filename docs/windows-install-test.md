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

## 10. Microphone

1. Settings → Dictation → Microphone: [ ] the list shows "System default" and your microphones
   (by name). Plug in a headset: [ ] it appears without reopening Settings.
2. Hold Ctrl and say a sentence, release. [ ] The Windows mic icon shows in the taskbar while
   recording. `%APPDATA%\AI Workflow\logs\main.log` has `Recording finished durationMs=…`
   with a peakDb above -50 (you were heard). No audio files appear anywhere in `%APPDATA%\AI Workflow`.
3. Keep mic ready = 10 seconds: after releasing, [ ] tray says "Listening" and the mic icon stays
   ~10 s, then both go away. Off: [ ] the mic icon disappears right after releasing.
4. Choose the headset, unplug it, dictate. [ ] It still records (System default) and Settings says
   "This microphone isn't connected".
5. Windows Settings → Privacy & security → Microphone → turn off "Let desktop apps access your
   microphone". Dictate. [ ] Tray menu: "Dictation: microphone blocked"; Settings explains how to fix
   it. Turn it back on: [ ] dictation works again.

## 11. Speech-to-text

1. Settings → AI servers → Speech-to-text: URL, model and API key of the speech server (dev: see
   README "Speech-to-text"). [ ] "Test connection" says Connected.
2. Click into Notepad. Hold Ctrl, say a sentence (~10 s), release. [ ] Tray shows "Transcribing",
   then the text appears in Notepad (section 12). [ ] It took under 2 s (`main.log`:
   `Transcribed … latencyMs=…`, below 2000). The text is not in `main.log`.
3. Hold Ctrl without speaking for 2 s. [ ] Notification "Nothing was heard"; nothing is sent.
4. Disconnect the network (or enter a wrong URL), dictate. [ ] "Dictation failed" with a message
   about reaching the server; the clipboard is unchanged. Wrong API key: [ ] "rejected the API key".

## 12. Paste at cursor

Before each app: copy something of your own (e.g. a word in Notepad) so you can check it comes back.

1. Dictate into each, cursor in a text field. [ ] The text appears at the cursor, no notification,
   and afterwards Ctrl+V pastes **your** copied word again (clipboard restored):
   [ ] Outlook (new mail body) [ ] Teams (chat box) [ ] Edge or Chrome (e.g. a search box)
   [ ] VS Code (editor) [ ] Word [ ] Notepad
2. Windows Terminal or Command Prompt: [ ] the text appears (Ctrl+Shift+V is used there).
3. Copy an image (or files in Explorer), dictate into Notepad, then paste in Paint (or a folder).
   [ ] The image (or files) comes back.
4. Win+V (clipboard history, turn it on if asked): [ ] the dictated text is **not** in the list.
5. Start Notepad with right-click → **Run as administrator**, dictate into it. [ ] Nothing typed;
   notification "Can't type into an app running as administrator. Text copied — press Ctrl+V";
   [ ] Ctrl+V pastes the text.
6. Dictate, and while it says "Transcribing" press Win+D (desktop, no window focused). [ ] Notice
   "Couldn't paste here. Text copied"; Ctrl+V pastes it.
7. `main.log`: [ ] `Pasted clipboard=restored ms=…` lines; no dictated text anywhere.
8. Windows Security → Protection history: [ ] nothing about `aiw-paste.exe`.

## 13. Dictation overlay

1. Click into Outlook (new mail). Hold Ctrl. [ ] A bar appears at once at the bottom-centre of the
   screen, above the taskbar: red mic, moving level meter while you speak, "Listening…", chip
   "Outlook". [ ] The caret is still blinking in Outlook (focus not taken).
2. Release. [ ] The bar says "Transcribing…" without disappearing in between, then goes away when
   the text is pasted.
3. Toggle shortcut: [ ] the bar shows "Esc to cancel"; Esc hides it at once, nothing is pasted.
4. Second monitor: move the mouse there, dictate. [ ] The bar appears on that monitor.
5. A full-screen browser video (F11) or a maximised Teams call: [ ] the bar shows on top.
6. Click "through" the bar while it's up. [ ] The click reaches the app underneath.
7. Teams, Edge, VS Code, Notepad: [ ] the chip names the app (no window or document titles).

## 14. AI cleanup

1. Settings → AI servers → LLM set up; "Test connection" says Connected. Settings → AI cleanup:
   [ ] Light is selected; the page shows Off / Light / Polished with examples.
2. Light, in Notepad: say "um so can we uh move the call to friday". [ ] Pasted:
   "So can we move the call to Friday?" (or very close).
3. Polished: say "we ship on tuesday no wednesday and then um we check the numbers" plus a second
   topic. [ ] "Wednesday" only; paragraphs show as real line breaks in Notepad and Outlook.
4. Say "what time is the meeting tomorrow". [ ] Pasted as a question, not answered.
5. LLM URL changed to something unreachable: [ ] dictation still pastes (raw) within ~3 s, no
   error popup; `main.log` has `Cleanup skipped … reason=`.
6. `main.log`: [ ] `Cleaned up level=… ms=…`; no dictated text anywhere.

## 15. Style per app

1. Settings → Style per app: [ ] Outlook, Word = Professional; Teams, Slack = Casual; VS Code,
   Terminal, Command Prompt = Code.
2. Say "hey gonna send the deck tomorrow" into Outlook, then Teams. [ ] The bar shows
   "Outlook · Professional" / "Teams · Casual"; Outlook gets "going to" and a full stop, Teams keeps
   "gonna" and no final full stop. Neither adds a greeting or sign-off.
3. VS Code: "open package dot json and import use state". [ ] `package.json`, `useState`.
   Windows Terminal: "make dir projects", "cd projects", "git status". [ ] `mkdir projects`,
   `cd projects`, `git status` — no full stop, lowercase, and nothing runs until you press Enter.
   "delete everything in this folder" [ ] stays as those words (never a command).
4. An app without a rule (e.g. Paint's text tool): [ ] the bar shows only the app name.
5. Add a rule for that app (Casual), dictate again. [ ] Bar shows "· Casual". Restore defaults works.

## 16. Custom folder

```
start /wait AI-Workflow-Setup-<version>.exe /S /D=%USERPROFILE%\Apps\AI Workflow
```

- [ ] Installed there; the app starts from the Start menu shortcut.
