// aiw-key-listener (macOS) — AI Workflow's Ctrl watcher when running from source (VAI-312, D-019).
//
// Same protocol as the Windows helper (native/win-key-listener), so the TypeScript side
// (electron/hotkey) is shared:
//
//   READY              event tap installed
//   CTRL_DOWN clean    Control went down while no other key was held
//   CTRL_DOWN dirty    Control went down while another key was already held
//   CTRL_UP            the last Control key went up
//   OTHER              another key, modifier, mouse button or scroll while Control is held
//   NO_PERMISSION      no Input Monitoring permission (macOS adds the app to the list); exits
//
// Privacy: it never reports WHICH key was pressed and never records text. The tap is
// listen-only: it can't block or change input. Events posted by our paste helper (marked with
// PASTE_MARKER) are ignored. It exits when stdin closes (the app quit or crashed).
// Ideas from OpenWhispr's resources/macos-globe-listener.swift (MIT); this file is our own code.
//
// Build: node scripts/build-mac-helpers.mjs   (swiftc, from Xcode command-line tools)
import CoreGraphics
import Foundation

/// Must match native/mac-paste/main.swift.
let PASTE_MARKER: Int64 = 0x4149_5746  // "AIWF"

func emit(_ line: String) {
  FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

if !CGPreflightListenEventAccess() {
  _ = CGRequestListenEventAccess()  // puts the app in System Settings → Input Monitoring
  emit("NO_PERMISSION")
  exit(0)
}

let otherModifiers: CGEventFlags = [.maskShift, .maskCommand, .maskAlternate, .maskSecondaryFn]
var ctrlHeld = false
var modifiersHeld: CGEventFlags = []
var keysHeld = Set<Int64>()
var tap: CFMachPort?

func handle(_ type: CGEventType, _ event: CGEvent) {
  if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
    if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
    return
  }
  if event.getIntegerValueField(.eventSourceUserData) == PASTE_MARKER { return }

  switch type {
  case .flagsChanged:
    let flags = event.flags
    let ctrlNow = flags.contains(.maskControl)
    let modsNow = flags.intersection(otherModifiers)
    if !ctrlHeld && ctrlNow {
      emit(modifiersHeld.isEmpty && keysHeld.isEmpty ? "CTRL_DOWN clean" : "CTRL_DOWN dirty")
    } else if ctrlHeld && !ctrlNow {
      emit("CTRL_UP")
    } else if ctrlHeld && !modsNow.subtracting(modifiersHeld).isEmpty {
      emit("OTHER")  // e.g. Ctrl then Shift
    }
    ctrlHeld = ctrlNow
    modifiersHeld = modsNow
  case .keyDown:
    let code = event.getIntegerValueField(.keyboardEventKeycode)
    if ctrlHeld && !keysHeld.contains(code) { emit("OTHER") }
    keysHeld.insert(code)
  case .keyUp:
    keysHeld.remove(event.getIntegerValueField(.keyboardEventKeycode))
  case .leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel:
    if ctrlHeld { emit("OTHER") }  // Ctrl+click is a right-click on macOS
  default:
    break
  }
}

let types: [CGEventType] = [
  .flagsChanged, .keyDown, .keyUp, .leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel,
]
let mask = types.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << $1.rawValue) }

tap = CGEvent.tapCreate(
  tap: .cgSessionEventTap,
  place: .headInsertEventTap,
  options: .listenOnly,
  eventsOfInterest: mask,
  callback: { _, type, event, _ in
    handle(type, event)
    return Unmanaged.passUnretained(event)
  },
  userInfo: nil
)
guard let tap else {
  emit("NO_PERMISSION")  // the tap is refused without Input Monitoring
  exit(0)
}

let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)

// Exit when the app closes our stdin (normal quit or crash).
Thread.detachNewThread {
  _ = FileHandle.standardInput.readDataToEndOfFile()
  exit(0)
}

emit("READY")
CFRunLoopRun()
