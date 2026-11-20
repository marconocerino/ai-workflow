# macOS dev checklist (VAI-312)

Hold Ctrl and paste at the cursor when running **from source** on a Mac. There is no packaged
Mac app (D-019). Tick each box.

## 0. Setup

1. `xcode-select --install` (once). [ ] `xcrun --find swiftc` prints a path.
2. `unset ELECTRON_RUN_AS_NODE && npm start`. [ ] The terminal shows `built resources/mac/aiw-key-listener`
   and `built resources/mac/aiw-paste` the first time (later only when the Swift files change).
3. Settings → AI servers: speech-to-text set up, "Test connection" says Connected.

## 1. Permissions

The permissions belong to the app that runs `npm start` — **Terminal** or **VS Code** — not to
"AI Workflow".

1. Settings → Dictation, Shortcut = Hold Ctrl. [ ] Without Input Monitoring a note explains it,
   with "Open Input Monitoring settings" and "Check again". [ ] The toggle shortcut works meanwhile.
2. Click "Open Input Monitoring settings". [ ] System Settings opens on Input Monitoring, and your
   terminal app is in the list. Switch it on; macOS asks to quit and reopen it — do that, then
   `npm start` again. [ ] The note is gone; the Settings card says Ready · Hold Ctrl.
3. Dictate once into TextEdit. Without Accessibility: [ ] notice "To paste automatically, allow
   Accessibility…" and ⌘V pastes the text. Settings → Dictation shows the Accessibility note.
4. Click "Open Accessibility settings", switch your terminal app on, then "Check again".
   [ ] The note is gone.

## 2. Hold Ctrl

1. Click into TextEdit. Hold Ctrl ~0.5 s, say a sentence, release. [ ] The text appears at the
   cursor; no notification.
2. Ctrl+A, Ctrl+E, Ctrl+click (right-click) and Ctrl+scroll. [ ] None of them starts dictation.
3. Shift+Ctrl (Shift first). [ ] Doesn't start.
4. A quick Ctrl tap. [ ] Nothing happens.

## 3. Paste at cursor

Before each app copy a word of your own, so you can check it comes back.

1. Dictate into each; afterwards ⌘V pastes **your** word again (clipboard restored):
   [ ] TextEdit [ ] Notes [ ] Safari or Chrome (a text field) [ ] VS Code [ ] Terminal
   [ ] Slack or Teams (if installed)
2. Copy an image (e.g. from Preview), dictate, then paste in Preview (File → New from Clipboard).
   [ ] The image comes back.
3. A clipboard manager (if you use one, e.g. Raycast/Maccy): [ ] the dictated text is not in its
   history.
4. `~/Library/Application Support/AI Workflow/logs/main.log`: [ ] `Pasted clipboard=restored ms=…`
   lines; [ ] no dictated text anywhere.

## 4. Dictation overlay

1. Click into TextEdit, hold Ctrl. [ ] A bar appears at once at the bottom-centre above the Dock:
   mic, moving level meter, "Listening…", chip "TextEdit". [ ] TextEdit keeps focus (caret blinks).
2. Release. [ ] "Transcribing…", then the bar goes when the text is pasted.
3. In a full-screen app (green button) and on another desktop (Space): [ ] the bar shows there too.
