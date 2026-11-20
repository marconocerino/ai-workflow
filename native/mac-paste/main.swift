// aiw-paste (macOS) — paste dictated text at the cursor when running from source (VAI-312).
//
// Same protocol as the Windows helper (native/win-paste). Reads the text as UTF-8 from stdin
// (never the command line), then:
//
//   1. without Accessibility permission (needed to send ⌘V) it leaves the text on the clipboard;
//   2. saves the clipboard (every item and type);
//   3. puts the text on the clipboard for this Mac only (no Universal Clipboard), marked
//      transient and concealed so clipboard managers don't keep it;
//   4. waits briefly for held modifier keys to be released, then sends ⌘V;
//   5. after RESTORE_DELAY puts the saved clipboard back — only if nothing else was copied in
//      the meantime (changeCount unchanged).
//
// Prints exactly one line:
//
//   PASTED restored | PASTED kept | PASTED not-saved
//   FAILED bad-input | no-window | no-permission | clipboard | send
//
// `aiw-paste --front-app` (VAI-305) only prints `APP <name>` of the frontmost app (never a window
// title), or `APP ?`, and exits.
//
// Privacy: never prints, logs or stores the text; no files or network.
// Ideas (transient type, current-host-only, changeCount check) from OpenWhispr's
// resources/macos-fast-paste.swift (MIT); this file is our own code.
//
// Build: node scripts/build-mac-helpers.mjs   (swiftc, from Xcode command-line tools)
import AppKit
import ApplicationServices

/// Must match native/mac-key-listener/main.swift (so the watcher ignores our ⌘V).
let PASTE_MARKER: Int64 = 0x4149_5746  // "AIWF"
let MAX_INPUT_BYTES = 4 * 1024 * 1024
let MAX_SAVED_BYTES = 64 * 1024 * 1024
let RESTORE_DELAY: TimeInterval = 0.5
let MODIFIER_WAIT: TimeInterval = 0.5
let KEY_V: CGKeyCode = 9  // kVK_ANSI_V

func finish(_ line: String) -> Never {
  FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
  exit(0)
}

// The only argument: the front-app query. The text itself only ever comes on stdin.
if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--front-app" {
  let name = NSWorkspace.shared.frontmostApplication?.localizedName ?? "?"
  FileHandle.standardOutput.write(("APP " + name.replacingOccurrences(of: "\n", with: " ") + "\n").data(using: .utf8)!)
  exit(0)
}

let input = FileHandle.standardInput.readDataToEndOfFile()
guard input.count <= MAX_INPUT_BYTES, let text = String(data: input, encoding: .utf8),
  !text.isEmpty
else { finish("FAILED bad-input") }

let pasteboard = NSPasteboard.general

func writeText() -> Bool {
  pasteboard.prepareForNewContents(with: .currentHostOnly)
  let item = NSPasteboardItem()
  item.setString(text, forType: .string)
  // nspasteboard.org markers honoured by clipboard managers: don't record this.
  item.setData(Data(), forType: NSPasteboard.PasteboardType("org.nspasteboard.TransientType"))
  item.setData(Data(), forType: NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"))
  return pasteboard.writeObjects([item])
}

/// Can't paste: leave the text on the clipboard for ⌘V by hand.
func leaveText(_ reason: String) -> Never {
  finish(writeText() ? "FAILED \(reason)" : "FAILED clipboard")
}

if !AXIsProcessTrusted() { leaveText("no-permission") }
if NSWorkspace.shared.frontmostApplication == nil { leaveText("no-window") }

/// Every item and type on the clipboard, or nil if it's too big to keep.
func saveClipboard() -> [[(NSPasteboard.PasteboardType, Data)]]? {
  var total = 0
  var items: [[(NSPasteboard.PasteboardType, Data)]] = []
  for item in pasteboard.pasteboardItems ?? [] {
    var saved: [(NSPasteboard.PasteboardType, Data)] = []
    for type in item.types {
      guard let data = item.data(forType: type) else { continue }
      total += data.count
      if total > MAX_SAVED_BYTES { return nil }
      saved.append((type, data))
    }
    items.append(saved)
  }
  return items
}

func restoreClipboard(_ items: [[(NSPasteboard.PasteboardType, Data)]]) -> Bool {
  pasteboard.prepareForNewContents(with: .currentHostOnly)
  if items.isEmpty { return true }
  let objects = items.map { saved -> NSPasteboardItem in
    let item = NSPasteboardItem()
    for (type, data) in saved { item.setData(data, forType: type) }
    return item
  }
  return pasteboard.writeObjects(objects)
}

let saved = saveClipboard()
if !writeText() { finish("FAILED clipboard") }
let ours = pasteboard.changeCount

// Held modifiers would turn ⌘V into another shortcut; give the user a moment to let go.
let held: CGEventFlags = [.maskShift, .maskControl, .maskAlternate, .maskCommand]
let waitUntil = Date().addingTimeInterval(MODIFIER_WAIT)
while !CGEventSource.flagsState(.combinedSessionState).intersection(held).isEmpty
  && Date() < waitUntil
{
  Thread.sleep(forTimeInterval: 0.01)
}

func key(_ down: Bool) -> CGEvent? {
  let source = CGEventSource(stateID: .privateState)
  let event = CGEvent(keyboardEventSource: source, virtualKey: KEY_V, keyDown: down)
  event?.flags = .maskCommand
  event?.setIntegerValueField(.eventSourceUserData, value: PASTE_MARKER)
  return event
}
guard let down = key(true), let up = key(false) else { finish("FAILED send") }
down.post(tap: .cgSessionEventTap)
up.post(tap: .cgSessionEventTap)

Thread.sleep(forTimeInterval: RESTORE_DELAY)  // let the app read the clipboard first
guard let saved else { finish("PASTED not-saved") }
if pasteboard.changeCount != ours { finish("PASTED kept") }
finish(restoreClipboard(saved) ? "PASTED restored" : "PASTED not-saved")
