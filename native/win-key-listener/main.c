/*
 * aiw-key-listener — AI Workflow's Ctrl watcher for Windows (VAI-301, D-019).
 *
 * Low-level keyboard + mouse hooks that report ONLY what the Hold-Ctrl hotkey needs:
 *
 *   READY              hooks installed
 *   CTRL_DOWN clean    Ctrl went down while no other key was held
 *   CTRL_DOWN dirty    Ctrl went down while another key was already held
 *   CTRL_UP            the last Ctrl key went up
 *   OTHER              another key, mouse button or wheel while Ctrl is held
 *
 * Privacy: it never reports WHICH key was pressed and never records text. It never blocks
 * input (every event is passed on with CallNextHookEx). It exits when stdin closes (the app
 * quit or crashed), so it can't outlive AI Workflow.
 *
 * Ignored: keys sent by programs (LLKHF_INJECTED — e.g. our own Ctrl+V paste) and the fake
 * Left Ctrl that AltGr keyboard layouts send before Right Alt (scan code flag 0x200).
 * Idea for the AltGr check from OpenWhispr (MIT); this file is our own code.
 *
 * Build: node scripts/build-win-helper.mjs   (x86_64-w64-mingw32-gcc, from mingw-w64)
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>

static HHOOK g_keyboard = NULL;
static HHOOK g_mouse = NULL;
static DWORD g_mainThread = 0;
static BOOL g_leftCtrl = FALSE;
static BOOL g_rightCtrl = FALSE;
/* Non-Ctrl keys currently held (by virtual-key code); only used to tell clean from dirty. */
static BOOL g_down[256];

static void emit(const char *line) {
    fputs(line, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

static BOOL ctrl_held(void) { return g_leftCtrl || g_rightCtrl; }

static BOOL other_key_held(void) {
    for (int vk = 0; vk < 256; vk++) {
        if (g_down[vk]) return TRUE;
    }
    return FALSE;
}

static BOOL is_ctrl(DWORD vk) { return vk == VK_LCONTROL || vk == VK_RCONTROL || vk == VK_CONTROL; }

static LRESULT CALLBACK keyboard_proc(int code, WPARAM wParam, LPARAM lParam) {
    if (code == HC_ACTION) {
        const KBDLLHOOKSTRUCT *k = (const KBDLLHOOKSTRUCT *)lParam;
        BOOL down = (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN);
        BOOL up = (wParam == WM_KEYUP || wParam == WM_SYSKEYUP);
        BOOL injected = (k->flags & LLKHF_INJECTED) != 0;
        BOOL altgr_fake = (k->vkCode == VK_LCONTROL) && (k->scanCode & 0x200);

        if (!injected && !altgr_fake && k->vkCode < 256) {
            if (is_ctrl(k->vkCode)) {
                BOOL was = ctrl_held();
                if (k->vkCode == VK_RCONTROL) g_rightCtrl = down ? TRUE : (up ? FALSE : g_rightCtrl);
                else g_leftCtrl = down ? TRUE : (up ? FALSE : g_leftCtrl);
                if (!was && ctrl_held()) emit(other_key_held() ? "CTRL_DOWN dirty" : "CTRL_DOWN clean");
                else if (was && !ctrl_held()) emit("CTRL_UP");
            } else {
                if (down) {
                    if (!g_down[k->vkCode] && ctrl_held()) emit("OTHER");
                    g_down[k->vkCode] = TRUE;
                } else if (up) {
                    g_down[k->vkCode] = FALSE;
                }
            }
        }
    }
    return CallNextHookEx(g_keyboard, code, wParam, lParam);
}

static LRESULT CALLBACK mouse_proc(int code, WPARAM wParam, LPARAM lParam) {
    if (code == HC_ACTION && ctrl_held()) {
        const MSLLHOOKSTRUCT *m = (const MSLLHOOKSTRUCT *)lParam;
        BOOL injected = (m->flags & LLMHF_INJECTED) != 0;
        if (!injected && (wParam == WM_LBUTTONDOWN || wParam == WM_RBUTTONDOWN ||
                          wParam == WM_MBUTTONDOWN || wParam == WM_XBUTTONDOWN ||
                          wParam == WM_MOUSEWHEEL || wParam == WM_MOUSEHWHEEL)) {
            emit("OTHER");
        }
    }
    return CallNextHookEx(g_mouse, code, wParam, lParam);
}

/* Exit when the app closes our stdin (normal quit or crash). */
static DWORD WINAPI watch_stdin(LPVOID unused) {
    (void)unused;
    char buf[64];
    DWORD read;
    HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
    while (ReadFile(in, buf, sizeof buf, &read, NULL) && read > 0) {
    }
    PostThreadMessage(g_mainThread, WM_QUIT, 0, 0);
    return 0;
}

int main(void) {
    g_mainThread = GetCurrentThreadId();
    HINSTANCE self = GetModuleHandle(NULL);
    g_keyboard = SetWindowsHookExW(WH_KEYBOARD_LL, keyboard_proc, self, 0);
    g_mouse = SetWindowsHookExW(WH_MOUSE_LL, mouse_proc, self, 0);
    if (!g_keyboard || !g_mouse) {
        fprintf(stderr, "hook failed: %lu\n", GetLastError());
        return 2;
    }
    HANDLE watcher = CreateThread(NULL, 0, watch_stdin, NULL, 0, NULL);
    if (watcher) CloseHandle(watcher);
    emit("READY");

    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    UnhookWindowsHookEx(g_keyboard);
    UnhookWindowsHookEx(g_mouse);
    return 0;
}
