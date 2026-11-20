/*
 * aiw-paste — AI Workflow's "paste at cursor" for Windows (VAI-304, D-022).
 *
 * Started once per dictation. Reads the text as UTF-8 from stdin (never from the command line,
 * which other processes can read), then:
 *
 *   1. finds the focused window; refuses admin (elevated) windows, which Windows doesn't let a
 *      normal app type into (UIPI) — it would fail silently;
 *   2. saves the clipboard (every format it can copy: text, formatting, images, copied files…);
 *   3. puts the text on the clipboard, marked so Windows clipboard history (Win+V), cloud
 *      clipboard sync and clipboard managers skip it;
 *   4. waits briefly for Shift/Alt/Win to be released, then sends Ctrl+V (Ctrl+Shift+V in
 *      terminals);
 *   5. after RESTORE_DELAY_MS puts the saved clipboard back — only if nothing else was copied in
 *      the meantime (clipboard sequence number unchanged).
 *
 * If it can't paste, the text stays on the clipboard and it says why. Prints exactly one line:
 *
 *   PASTED restored      pasted; clipboard put back
 *   PASTED kept          pasted; something new was copied meanwhile, so that was kept
 *   PASTED not-saved     pasted; the old clipboard couldn't be saved (too big / busy)
 *   FAILED <reason>      bad-input | no-window | elevated | keys-held | clipboard | send
 *
 * `aiw-paste --front-app` (VAI-305) only prints `APP <program>` for the focused window, e.g.
 * `APP OUTLOOK.EXE` (program file name, never the window title), or `APP ?`, and exits.
 *
 * Privacy: it never prints, logs or stores the text; no files, registry or network.
 * Ideas (terminal list, waiting for modifiers, restore-if-unchanged) from OpenWhispr's
 * resources/windows-fast-paste.c and src/helpers/clipboard.js (MIT); this file is our own code.
 *
 * Build: node scripts/build-win-helper.mjs   (x86_64-w64-mingw32-gcc, from mingw-w64)
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#define MAX_INPUT_BYTES (4u * 1024u * 1024u)
#define MAX_SAVED_BYTES (64u * 1024u * 1024u)
#define RESTORE_DELAY_MS 500
#define MODIFIER_WAIT_MS 500

static void emit(const char *line) {
    fputs(line, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

/* ---- input ---------------------------------------------------------------------------- */

/* All of stdin as UTF-16 (caller frees), or NULL. */
static wchar_t *read_text(void) {
    HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
    char *buf = malloc(MAX_INPUT_BYTES + 1);
    DWORD total = 0, got = 0;
    if (!buf) return NULL;
    while (total < MAX_INPUT_BYTES &&
           ReadFile(in, buf + total, MAX_INPUT_BYTES - total, &got, NULL) && got > 0) {
        total += got;
    }
    wchar_t *text = NULL;
    if (total > 0) {
        int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, buf, (int)total, NULL, 0);
        if (n > 0) {
            text = malloc(((size_t)n + 1) * sizeof(wchar_t));
            if (text) {
                MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, buf, (int)total, text, n);
                text[n] = L'\0';
            }
        }
    }
    SecureZeroMemory(buf, total);
    free(buf);
    return text;
}

/* ---- target window ------------------------------------------------------------------- */

static const wchar_t *TERMINAL_CLASSES[] = {
    L"ConsoleWindowClass", L"CASCADIA_HOSTING_WINDOW_CLASS", L"mintty", L"VirtualConsoleClass",
    L"PuTTY", L"Alacritty", L"org.wezfurlong.wezterm", L"TMobaXterm", L"kitty", NULL};
/* Electron-based terminals share Chrome_WidgetWin_1, so match them by executable name. */
static const wchar_t *TERMINAL_EXES[] = {L"termius.exe", L"tabby.exe", L"hyper.exe",
                                         L"wave.exe", L"rio.exe", NULL};

static BOOL in_list(const wchar_t *s, const wchar_t **list) {
    for (int i = 0; list[i]; i++) {
        if (_wcsicmp(s, list[i]) == 0) return TRUE;
    }
    return FALSE;
}

static HANDLE open_window_process(HWND hwnd) {
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    return pid ? OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid) : NULL;
}

static BOOL is_terminal(HWND hwnd) {
    wchar_t cls[256];
    if (GetClassNameW(hwnd, cls, 256) > 0 && in_list(cls, TERMINAL_CLASSES)) return TRUE;
    HANDLE proc = open_window_process(hwnd);
    if (!proc) return FALSE;
    wchar_t path[MAX_PATH];
    DWORD len = MAX_PATH;
    BOOL ok = QueryFullProcessImageNameW(proc, 0, path, &len);
    CloseHandle(proc);
    if (!ok) return FALSE;
    const wchar_t *base = wcsrchr(path, L'\\');
    return in_list(base ? base + 1 : path, TERMINAL_EXES);
}

/* 1 elevated, 0 not, -1 can't tell. */
static int token_elevated(HANDLE proc) {
    HANDLE token = NULL;
    if (!OpenProcessToken(proc, TOKEN_QUERY, &token)) return -1;
    TOKEN_ELEVATION elevation;
    DWORD size = 0;
    BOOL ok = GetTokenInformation(token, TokenElevation, &elevation, sizeof elevation, &size);
    CloseHandle(token);
    return ok ? (elevation.TokenIsElevated ? 1 : 0) : -1;
}

/* Would Windows block our input into this window? (target elevated, we are not) */
static BOOL blocked_by_elevation(HWND hwnd) {
    if (token_elevated(GetCurrentProcess()) == 1) return FALSE;
    HANDLE proc = open_window_process(hwnd);
    if (!proc) return TRUE; /* can't even query it: a protected or elevated process */
    int elevated = token_elevated(proc);
    CloseHandle(proc);
    return elevated != 0;
}

/* ---- clipboard ----------------------------------------------------------------------- */

typedef struct {
    UINT format;
    SIZE_T size;
    void *data;
} SavedFormat;

typedef struct {
    SavedFormat *items;
    int count;
    BOOL ok;
} SavedClipboard;

/* The clipboard may be held by another app for a moment: retry for ~0.5 s. */
static BOOL open_clipboard(HWND owner) {
    for (int i = 0; i < 25; i++) {
        if (OpenClipboard(owner)) return TRUE;
        Sleep(20);
    }
    return FALSE;
}

/* Formats that are GDI handles, not memory; CF_BITMAP etc. are re-created from CF_DIB. */
static BOOL is_handle_format(UINT f) {
    return f == CF_BITMAP || f == CF_DSPBITMAP || f == CF_PALETTE || f == CF_METAFILEPICT ||
           f == CF_DSPMETAFILEPICT || f == CF_ENHMETAFILE || f == CF_DSPENHMETAFILE ||
           f == CF_OWNERDISPLAY;
}

static void free_saved(SavedClipboard *s) {
    for (int i = 0; i < s->count; i++) {
        SecureZeroMemory(s->items[i].data, s->items[i].size);
        free(s->items[i].data);
    }
    free(s->items);
    s->items = NULL;
    s->count = 0;
}

static SavedClipboard save_clipboard(HWND owner) {
    SavedClipboard s = {NULL, 0, FALSE};
    if (!open_clipboard(owner)) return s;
    int capacity = 0;
    SIZE_T total = 0;
    BOOL ok = TRUE;
    for (UINT f = EnumClipboardFormats(0); ok && f != 0; f = EnumClipboardFormats(f)) {
        if (is_handle_format(f)) continue;
        if (s.count == capacity) {
            int grown = capacity ? capacity * 2 : 16;
            SavedFormat *items = realloc(s.items, (size_t)grown * sizeof(SavedFormat));
            if (!items) {
                ok = FALSE;
                break;
            }
            s.items = items;
            capacity = grown;
        }
        HANDLE h = GetClipboardData(f);
        if (!h) continue;
        SIZE_T size = GlobalSize(h);
        void *src = GlobalLock(h);
        if (!src) continue;
        total += size;
        void *copy = total <= MAX_SAVED_BYTES ? malloc(size ? size : 1) : NULL;
        if (copy) {
            memcpy(copy, src, size);
            s.items[s.count++] = (SavedFormat){f, size, copy};
        } else {
            ok = FALSE; /* too big to keep: don't restore half of it */
        }
        GlobalUnlock(h);
    }
    CloseClipboard();
    if (!ok) free_saved(&s);
    s.ok = ok;
    return s;
}

static BOOL put_global(UINT format, const void *data, SIZE_T size) {
    HGLOBAL h = GlobalAlloc(GMEM_MOVEABLE, size ? size : 1);
    if (!h) return FALSE;
    void *dst = GlobalLock(h);
    if (!dst) {
        GlobalFree(h);
        return FALSE;
    }
    if (size) memcpy(dst, data, size);
    GlobalUnlock(h);
    if (!SetClipboardData(format, h)) {
        GlobalFree(h);
        return FALSE;
    }
    return TRUE; /* the clipboard owns h now */
}

/* Keep this out of Win+V history, cloud sync and clipboard managers (documented formats). */
static void mark_private(void) {
    DWORD zero = 0;
    put_global(RegisterClipboardFormatW(L"ExcludeClipboardContentFromMonitorProcessing"), &zero,
               sizeof zero);
    put_global(RegisterClipboardFormatW(L"CanIncludeInClipboardHistory"), &zero, sizeof zero);
    put_global(RegisterClipboardFormatW(L"CanUploadToCloudClipboard"), &zero, sizeof zero);
}

static BOOL write_text(HWND owner, const wchar_t *text) {
    if (!open_clipboard(owner)) return FALSE;
    BOOL ok = EmptyClipboard() &&
              put_global(CF_UNICODETEXT, text, (wcslen(text) + 1) * sizeof(wchar_t));
    if (ok) mark_private();
    CloseClipboard();
    return ok;
}

static BOOL restore_clipboard(HWND owner, const SavedClipboard *s) {
    if (!open_clipboard(owner)) return FALSE;
    BOOL ok = EmptyClipboard();
    for (int i = 0; ok && i < s->count; i++) {
        put_global(s->items[i].format, s->items[i].data, s->items[i].size);
    }
    /* Already in history from when it was first copied; don't add it a second time. */
    if (ok) {
        DWORD zero = 0;
        put_global(RegisterClipboardFormatW(L"CanIncludeInClipboardHistory"), &zero, sizeof zero);
        put_global(RegisterClipboardFormatW(L"CanUploadToCloudClipboard"), &zero, sizeof zero);
    }
    CloseClipboard();
    return ok;
}

/* ---- keys ---------------------------------------------------------------------------- */

static BOOL down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

/* Alt or Win held would turn Ctrl+V into another shortcut; Shift is fine (plain-text paste). */
static BOOL wait_for_modifiers(void) {
    for (int waited = 0; waited < MODIFIER_WAIT_MS; waited += 10) {
        if (!down(VK_MENU) && !down(VK_LWIN) && !down(VK_RWIN) && !down(VK_SHIFT)) return TRUE;
        Sleep(10);
    }
    return !down(VK_MENU) && !down(VK_LWIN) && !down(VK_RWIN);
}

static void key(INPUT *in, WORD vk, BOOL up) {
    memset(in, 0, sizeof *in);
    in->type = INPUT_KEYBOARD;
    in->ki.wVk = vk;
    in->ki.wScan = (WORD)MapVirtualKeyW(vk, MAPVK_VK_TO_VSC);
    in->ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
}

static BOOL send_paste(BOOL terminal) {
    INPUT in[6];
    UINT n = 0;
    key(&in[n++], VK_CONTROL, FALSE);
    if (terminal) key(&in[n++], VK_SHIFT, FALSE);
    key(&in[n++], 'V', FALSE);
    key(&in[n++], 'V', TRUE);
    if (terminal) key(&in[n++], VK_SHIFT, TRUE);
    key(&in[n++], VK_CONTROL, TRUE);
    return SendInput(n, in, sizeof(INPUT)) == n;
}

/* ---- front app (VAI-305) --------------------------------------------------------------- */

/* "APP <file name of the focused window's program>" — the program, never the window title. */
static int print_front_app(void) {
    char name[MAX_PATH * 3] = "?";
    HWND hwnd = GetForegroundWindow();
    HANDLE proc = hwnd ? open_window_process(hwnd) : NULL;
    if (proc) {
        wchar_t path[MAX_PATH];
        DWORD len = MAX_PATH;
        if (QueryFullProcessImageNameW(proc, 0, path, &len)) {
            const wchar_t *base = wcsrchr(path, L'\\');
            base = base ? base + 1 : path;
            if (!WideCharToMultiByte(CP_UTF8, 0, base, -1, name, (int)sizeof name, NULL, NULL)) {
                strcpy(name, "?");
            }
        }
        CloseHandle(proc);
    }
    fputs("APP ", stdout);
    fputs(name, stdout);
    fputc('\n', stdout);
    fflush(stdout);
    return 0;
}

/* ---- main ---------------------------------------------------------------------------- */

static int finish(const char *line, wchar_t *text, SavedClipboard *saved) {
    emit(line);
    if (text) {
        SecureZeroMemory(text, wcslen(text) * sizeof(wchar_t));
        free(text);
    }
    if (saved) free_saved(saved);
    return 0;
}

int main(int argc, char **argv) {
    /* The only argument: the front-app query. The text itself only ever comes on stdin. */
    if (argc == 2 && strcmp(argv[1], "--front-app") == 0) return print_front_app();
    wchar_t *text = read_text();
    if (!text || !text[0]) return finish("FAILED bad-input", text, NULL);

    /* A message-only window to own the clipboard (needed for SetClipboardData). */
    HWND owner = CreateWindowExW(0, L"STATIC", L"", 0, 0, 0, 0, 0, HWND_MESSAGE, NULL,
                                 GetModuleHandleW(NULL), NULL);

    HWND target = GetForegroundWindow();
    const char *problem = NULL;
    if (!target) problem = "FAILED no-window";
    else if (blocked_by_elevation(target)) problem = "FAILED elevated";

    /* Can't paste: just leave the text on the clipboard for Ctrl+V by hand. */
    if (problem) {
        return finish(write_text(owner, text) ? problem : "FAILED clipboard", text, NULL);
    }

    SavedClipboard saved = save_clipboard(owner);
    if (!write_text(owner, text)) return finish("FAILED clipboard", text, &saved);
    DWORD ours = GetClipboardSequenceNumber();

    if (!wait_for_modifiers()) return finish("FAILED keys-held", text, &saved);
    if (!send_paste(is_terminal(target))) return finish("FAILED send", text, &saved);

    Sleep(RESTORE_DELAY_MS); /* let the app read the clipboard first */
    if (!saved.ok) return finish("PASTED not-saved", text, &saved);
    if (GetClipboardSequenceNumber() != ours) return finish("PASTED kept", text, &saved);
    return finish(restore_clipboard(owner, &saved) ? "PASTED restored" : "PASTED not-saved", text,
                  &saved);
}
