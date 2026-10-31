# Driving the built app on a macOS desktop: the same verbs as MenoGui.psm1,
# spoken to Quartz and the accessibility API instead of to user32.
#
# Every function here takes coordinates in pixels of the window's own
# screenshot, so a scenario can be written against what a shot shows. On a
# Retina display that is two pixels to the point; the conversion to the points
# macOS posts events in happens here and nowhere else. See README.md for the
# verbs a platform module has to provide, and for what is different on a Mac.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
# (a question about the network is answered by the person at the computer, never by a run)
Import-Module (Join-Path $PSScriptRoot "MenoConsent.psm1")

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

public static class MacGui {
  const string CG = "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics";
  const string CF = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
  const string AX = "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices";
  const string ObjC = "/usr/lib/libobjc.A.dylib";

  [StructLayout(LayoutKind.Sequential)] public struct CGPoint { public double X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct CGSize { public double Width, Height; }
  [StructLayout(LayoutKind.Sequential)] public struct CGRect { public CGPoint Origin; public CGSize Size; }

  public class WindowInfo {
    public uint Id; public int Pid; public int Layer; public string Owner;
    // (its owner's executable's file name: not put into the user's language, as Owner is - "Mitteilungszentrale" in German, say)
    public string Exe;
    public double X, Y, Width, Height;
    public bool Contains(double x, double y) { return x >= X && y >= Y && x < X + Width && y < Y + Height; }
  }

  [DllImport(CF)] static extern void CFRelease(IntPtr o);
  [DllImport(CF)] static extern long CFArrayGetCount(IntPtr a);
  [DllImport(CF)] static extern IntPtr CFArrayGetValueAtIndex(IntPtr a, long i);
  [DllImport(CF)] static extern IntPtr CFDictionaryGetValue(IntPtr d, IntPtr key);
  [DllImport(CF)] [return: MarshalAs(UnmanagedType.I1)] static extern bool CFNumberGetValue(IntPtr n, long type, out long v);
  [DllImport(CF)] [return: MarshalAs(UnmanagedType.I1)] static extern bool CFNumberGetValue(IntPtr n, long type, out double v);
  [DllImport(CF)] static extern ulong CFGetTypeID(IntPtr o);
  [DllImport(CF)] static extern ulong CFStringGetTypeID();
  [DllImport(CF)] static extern IntPtr CFStringCreateWithCString(IntPtr alloc, byte[] s, uint encoding);
  [DllImport(CF)] [return: MarshalAs(UnmanagedType.I1)] static extern bool CFStringGetCString(IntPtr s, byte[] buf, long size, uint encoding);

  [DllImport(CG)] static extern IntPtr CGWindowListCopyWindowInfo(uint option, uint relativeTo);
  [DllImport(CG)] [return: MarshalAs(UnmanagedType.I1)] static extern bool CGRectMakeWithDictionaryRepresentation(IntPtr d, out CGRect r);
  [DllImport(CG)] [return: MarshalAs(UnmanagedType.I1)] public static extern bool CGPreflightScreenCaptureAccess();
  [DllImport(CG)] [return: MarshalAs(UnmanagedType.I1)] public static extern bool CGPreflightPostEventAccess();

  [DllImport(CG)] static extern IntPtr CGEventCreateMouseEvent(IntPtr source, uint type, CGPoint at, uint button);
  [DllImport(CG)] static extern IntPtr CGEventCreateScrollWheelEvent2(IntPtr source, uint units, uint count, int w1, int w2, int w3);
  [DllImport(CG)] static extern IntPtr CGEventCreateKeyboardEvent(IntPtr source, ushort key, [MarshalAs(UnmanagedType.I1)] bool down);
  [DllImport(CG)] static extern void CGEventKeyboardSetUnicodeString(IntPtr e, ulong length, ushort[] text);
  [DllImport(CG)] static extern void CGEventSetIntegerValueField(IntPtr e, uint field, long value);
  [DllImport(CG)] static extern void CGEventSetFlags(IntPtr e, ulong flags);
  [DllImport(CG)] static extern void CGEventSetLocation(IntPtr e, CGPoint at);
  [DllImport(CG)] static extern void CGEventPost(uint tap, IntPtr e);
  [DllImport(CG)] static extern IntPtr CGEventSourceCreate(int stateId);

  [DllImport(AX)] [return: MarshalAs(UnmanagedType.I1)] public static extern bool AXIsProcessTrusted();
  [DllImport(AX)] static extern IntPtr AXUIElementCreateApplication(int pid);
  [DllImport(AX)] static extern int AXUIElementCopyAttributeValue(IntPtr e, IntPtr attr, out IntPtr value);
  [DllImport(AX)] static extern int AXUIElementSetAttributeValue(IntPtr e, IntPtr attr, IntPtr value);
  [DllImport(AX)] static extern IntPtr AXUIElementCreateSystemWide();
  [DllImport(AX)] static extern int AXUIElementCopyElementAtPosition(IntPtr app, float x, float y, out IntPtr element);
  [DllImport(AX)] static extern int AXUIElementGetPid(IntPtr element, out int pid);
  [DllImport(AX)] static extern IntPtr AXValueCreate(uint type, ref CGPoint p);
  [DllImport(AX)] static extern IntPtr AXValueCreate(uint type, ref CGSize s);
  [DllImport(AX)] [return: MarshalAs(UnmanagedType.I1)] static extern bool AXValueGetValue(IntPtr v, uint type, out CGPoint p);
  [DllImport(AX)] [return: MarshalAs(UnmanagedType.I1)] static extern bool AXValueGetValue(IntPtr v, uint type, out CGSize s);

  [DllImport(ObjC)] static extern IntPtr objc_getClass(string name);
  [DllImport(ObjC)] static extern IntPtr sel_registerName(string name);
  [DllImport(ObjC, EntryPoint = "objc_msgSend")] static extern IntPtr Send(IntPtr self, IntPtr sel);
  [DllImport(ObjC, EntryPoint = "objc_msgSend")] static extern IntPtr SendPid(IntPtr self, IntPtr sel, int pid);
  [DllImport(ObjC, EntryPoint = "objc_msgSend")] static extern byte SendBool(IntPtr self, IntPtr sel);
  [DllImport(ObjC, EntryPoint = "objc_msgSend")] static extern byte SendBoolOptions(IntPtr self, IntPtr sel, ulong options);
  [DllImport(ObjC, EntryPoint = "objc_msgSend")] static extern int SendInt(IntPtr self, IntPtr sel);

  // Undocumented, and only used to name the right app in an error message.
  [DllImport("/usr/lib/libSystem.B.dylib")] static extern int responsibility_get_pid_responsible_for_pid(int pid);
  [DllImport("/usr/lib/libSystem.B.dylib")] static extern int proc_pidpath(int pid, byte[] buf, uint size);

  const uint Utf8 = 0x08000100;               // kCFStringEncodingUTF8
  const long SInt64 = 4, Float64 = 13;        // kCFNumberSInt64Type, kCFNumberFloat64Type
  const uint OnScreenOnly = 1, ExcludeDesktop = 16;
  const uint HidTap = 0;                      // kCGHIDEventTap
  const uint EvMoved = 5, EvLeftDown = 1, EvLeftUp = 2, EvLeftDragged = 6;   // CGEventType
  const uint EvRightDown = 3, EvRightUp = 4, EvRightDragged = 7, RightButton = 1;
  const uint ClickState = 1;                  // kCGMouseEventClickState
  const uint PixelUnits = 0;                  // kCGScrollEventUnitPixel

  static readonly Dictionary<string, IntPtr> strings = new Dictionary<string, IntPtr>();
  static IntPtr Str(string s) {
    IntPtr p;
    if (!strings.TryGetValue(s, out p)) {
      p = CFStringCreateWithCString(IntPtr.Zero, System.Text.Encoding.UTF8.GetBytes(s + "\0"), Utf8);
      strings[s] = p;   // kept for the life of the process: there are a handful
    }
    return p;
  }

  static long Int(IntPtr dict, string key) {
    IntPtr n = CFDictionaryGetValue(dict, Str(key));
    long v = 0;
    if (n != IntPtr.Zero) CFNumberGetValue(n, SInt64, out v);
    return v;
  }

  static string Text(IntPtr dict, string key) {
    IntPtr s = CFDictionaryGetValue(dict, Str(key));
    if (s == IntPtr.Zero) return "";
    byte[] buf = new byte[1024];
    return CFStringGetCString(s, buf, buf.Length, Utf8)
      ? System.Text.Encoding.UTF8.GetString(buf, 0, Array.IndexOf(buf, (byte)0)) : "";
  }

  // Every window on screen, front to back, in global points (origin at the
  // top left of the main display). Owner names come without Screen Recording;
  // titles do not, and nothing here needs them.
  public static List<WindowInfo> Windows() {
    var list = new List<WindowInfo>();
    var exes = new Dictionary<int, string>();
    IntPtr arr = CGWindowListCopyWindowInfo(OnScreenOnly | ExcludeDesktop, 0);
    if (arr == IntPtr.Zero) return list;
    try {
      long n = CFArrayGetCount(arr);
      for (long i = 0; i < n; i++) {
        IntPtr d = CFArrayGetValueAtIndex(arr, i);
        CGRect r;
        if (!CGRectMakeWithDictionaryRepresentation(CFDictionaryGetValue(d, Str("kCGWindowBounds")), out r)) continue;
        int pid = (int)Int(d, "kCGWindowOwnerPID");
        if (!exes.ContainsKey(pid)) exes[pid] = ExeName(pid);
        list.Add(new WindowInfo {
          Id = (uint)Int(d, "kCGWindowNumber"), Pid = pid,
          Layer = (int)Int(d, "kCGWindowLayer"), Owner = Text(d, "kCGWindowOwnerName"), Exe = exes[pid],
          X = r.Origin.X, Y = r.Origin.Y, Width = r.Size.Width, Height = r.Size.Height });
      }
    } finally { CFRelease(arr); }
    return list;
  }

  // An app's windows come and go in a way its main one does not: a tab strip
  // that is really a window, a panel parked off screen. The main window is
  // the biggest ordinary one.
  public static WindowInfo MainWindowOf(int pid) {
    WindowInfo best = null;
    foreach (var w in Windows()) {
      if (w.Pid != pid || w.Layer != 0) continue;
      if (best == null || w.Width * w.Height > best.Width * best.Height) best = w;
    }
    return best;
  }

  public static WindowInfo WindowById(uint id) {
    foreach (var w in Windows()) if (w.Id == id) return w;
    return null;
  }

  // Put a window where it is asked to be, through the accessibility API: the
  // only way to move another app's window. The accessibility side does not
  // know window numbers, so the window is the one where the number says.
  public static void Place(int pid, uint id, double x, double y, double width, double height) {
    WindowInfo target = WindowById(id);
    if (target == null) throw new InvalidOperationException("window " + id + " is not on screen");
    IntPtr app = AXUIElementCreateApplication(pid);
    try {
      IntPtr wins;
      int err = AXUIElementCopyAttributeValue(app, Str("AXWindows"), out wins);
      if (err != 0) throw new InvalidOperationException("the accessibility API would not list the app's windows (AXError " + err + ")");
      try {
        IntPtr win = IntPtr.Zero;
        long n = CFArrayGetCount(wins);
        for (long i = 0; i < n && win == IntPtr.Zero; i++) {
          IntPtr w = CFArrayGetValueAtIndex(wins, i);
          CGPoint p; CGSize s;
          if (!ReadPoint(w, out p) || !ReadSize(w, out s)) continue;
          if (Math.Abs(p.X - target.X) < 1 && Math.Abs(p.Y - target.Y) < 1 &&
              Math.Abs(s.Width - target.Width) < 1 && Math.Abs(s.Height - target.Height) < 1) win = w;
        }
        if (win == IntPtr.Zero) throw new InvalidOperationException("no accessibility element for window " + id);
        // Position, size, and position again: a window grown past the edge
        // of the screen is pushed back, so where it lands depends on the order.
        SetPoint(win, x, y);
        SetSize(win, width, height);
        SetPoint(win, x, y);
      } finally { CFRelease(wins); }
    } finally { CFRelease(app); }
  }

  static bool ReadPoint(IntPtr w, out CGPoint p) {
    p = new CGPoint(); IntPtr v;
    if (AXUIElementCopyAttributeValue(w, Str("AXPosition"), out v) != 0) return false;
    try { return AXValueGetValue(v, 1, out p); } finally { CFRelease(v); }
  }
  static bool ReadSize(IntPtr w, out CGSize s) {
    s = new CGSize(); IntPtr v;
    if (AXUIElementCopyAttributeValue(w, Str("AXSize"), out v) != 0) return false;
    try { return AXValueGetValue(v, 2, out s); } finally { CFRelease(v); }
  }
  static void SetPoint(IntPtr w, double x, double y) {
    CGPoint p = new CGPoint { X = x, Y = y };
    IntPtr v = AXValueCreate(1, ref p);
    try { Check(AXUIElementSetAttributeValue(w, Str("AXPosition"), v), "move"); } finally { CFRelease(v); }
  }
  static void SetSize(IntPtr w, double width, double height) {
    CGSize s = new CGSize { Width = width, Height = height };
    IntPtr v = AXValueCreate(2, ref s);
    try { Check(AXUIElementSetAttributeValue(w, Str("AXSize"), v), "resize"); } finally { CFRelease(v); }
  }
  static void Check(int err, string what) {
    if (err != 0) throw new InvalidOperationException("the accessibility API would not " + what + " the window (AXError " + err + ")");
  }

  // NSRunningApplication and NSWorkspace, through the Objective-C runtime:
  // AppKit has to be in the process for their classes to exist at all.
  static bool appKit;
  static IntPtr Cls(string name) {
    if (!appKit) { NativeLibrary.Load("/System/Library/Frameworks/AppKit.framework/AppKit"); appKit = true; }
    return objc_getClass(name);
  }
  static IntPtr Running(int pid) {
    return SendPid(Cls("NSRunningApplication"), sel_registerName("runningApplicationWithProcessIdentifier:"), pid);
  }

  public static bool Activate(int pid) {
    IntPtr app = Running(pid);
    return app != IntPtr.Zero && SendBoolOptions(app, sel_registerName("activateWithOptions:"), 0) != 0;
  }

  // Quit the way the Dock asks an app to, rather than by signal.
  public static bool Terminate(int pid) {
    IntPtr app = Running(pid);
    return app != IntPtr.Zero && SendBool(app, sel_registerName("terminate")) != 0;
  }

  public static string AppName(int pid) {
    IntPtr app = Running(pid);
    if (app == IntPtr.Zero) return "pid " + pid;
    IntPtr s = Send(app, sel_registerName("localizedName"));
    IntPtr utf8 = s == IntPtr.Zero ? IntPtr.Zero : Send(s, sel_registerName("UTF8String"));
    return utf8 == IntPtr.Zero ? "pid " + pid : Marshal.PtrToStringUTF8(utf8);
  }

  // The file name of the executable a process runs - SecurityAgent,
  // NotificationCenter - or "" where it is not to be had.
  public static string ExeName(int pid) {
    byte[] buf = new byte[4096];
    if (proc_pidpath(pid, buf, (uint)buf.Length) <= 0) return "";
    string path = System.Text.Encoding.UTF8.GetString(buf, 0, Array.IndexOf(buf, (byte)0));
    return path.Substring(path.LastIndexOf('/') + 1);
  }

  // The process whose element a click at a point in global points would
  // reach, as Accessibility tells it - through windows that let clicks go
  // by, as Notification Center's empty one over the whole screen does - or
  // -1 where it cannot tell.
  public static int PidAt(double x, double y) {
    IntPtr sys = AXUIElementCreateSystemWide();
    if (sys == IntPtr.Zero) return -1;
    try {
      IntPtr el;
      if (AXUIElementCopyElementAtPosition(sys, (float)x, (float)y, out el) != 0 || el == IntPtr.Zero) return -1;
      try {
        int pid;
        return AXUIElementGetPid(el, out pid) == 0 ? pid : -1;
      } finally { CFRelease(el); }
    } finally { CFRelease(sys); }
  }

  // What Accessibility read of a part, for the guard against answering a
  // question about the network (MenoConsent.psm1): the part and what it sits
  // in, "role\tname" each, itself first, a few levels up - or why it could
  // not be read, which is never taken for a part that is not the yes.
  public class Lookup { public string[] Chain = new string[0]; public string Error; }

  const int AXNoValue = -25212;   // kAXErrorNoValue: no value there - for the focus, nothing has the keys

  // Why a lookup failed, or null where it did not: for the focus, no value is
  // nothing focused, which is no failure.
  public static string LookupError(int err, bool focus, string what) {
    if (err == 0) return null;
    if (focus && err == AXNoValue) return null;
    return "AXError " + err + " " + what;
  }

  // The part of a window at a point.
  public static Lookup ChainAt(double x, double y) {
    var r = new Lookup();
    IntPtr sys = AXUIElementCreateSystemWide();
    if (sys == IntPtr.Zero) { r.Error = "no system-wide Accessibility element"; return r; }
    try {
      IntPtr el;
      int err = AXUIElementCopyElementAtPosition(sys, (float)x, (float)y, out el);
      r.Error = LookupError(err, false, "asking what is at the point");
      if (r.Error == null && el == IntPtr.Zero) r.Error = "nothing given for the point";
      if (r.Error != null) return r;
      try { r.Chain = Chain(el); } finally { CFRelease(el); }
    } finally { CFRelease(sys); }
    return r;
  }

  // The part of an app that has the keys: an empty chain where nothing has.
  public static Lookup FocusedChain(int pid) {
    var r = new Lookup();
    IntPtr app = AXUIElementCreateApplication(pid);
    if (app == IntPtr.Zero) { r.Error = "no Accessibility element for the app"; return r; }
    try {
      IntPtr el;
      int err = AXUIElementCopyAttributeValue(app, Str("AXFocusedUIElement"), out el);
      r.Error = LookupError(err, true, "asking what has the keys");
      if (r.Error != null || err == AXNoValue) return r;
      if (el == IntPtr.Zero) { r.Error = "nothing given for what has the keys"; return r; }
      try { r.Chain = Chain(el); } finally { CFRelease(el); }
    } finally { CFRelease(app); }
    return r;
  }

  static string[] Chain(IntPtr el) {
    var links = new List<string>();
    IntPtr e = el;
    for (int i = 0; i < 6 && e != IntPtr.Zero; i++) {
      string role = AxString(e, "AXRole") ?? "";
      links.Add(role + "\t" + NameOf(e, role));
      IntPtr up;
      if (AXUIElementCopyAttributeValue(e, Str("AXParent"), out up) != 0) up = IntPtr.Zero;
      if (e != el) CFRelease(e);
      e = up;
    }
    if (e != IntPtr.Zero && e != el) CFRelease(e);
    return links.ToArray();
  }

  // What a reader of the window calls a part: its title, its description,
  // a text's words - or, for a button named by nothing else, the words in it.
  static string NameOf(IntPtr e, string role) {
    string name = AxString(e, "AXTitle");
    if (string.IsNullOrEmpty(name)) name = AxString(e, "AXDescription");
    if (string.IsNullOrEmpty(name) && role == "AXStaticText") name = AxString(e, "AXValue");
    if (string.IsNullOrEmpty(name) && role == "AXButton") {
      IntPtr kids;
      if (AXUIElementCopyAttributeValue(e, Str("AXChildren"), out kids) == 0 && kids != IntPtr.Zero) {
        try {
          var words = new List<string>();
          long n = CFArrayGetCount(kids);
          for (long i = 0; i < n && i < 8; i++) {
            IntPtr k = CFArrayGetValueAtIndex(kids, i);
            if ((AxString(k, "AXRole") ?? "") == "AXStaticText") { string w = AxString(k, "AXValue"); if (!string.IsNullOrEmpty(w)) words.Add(w); }
          }
          name = string.Join(" ", words);
        } finally { CFRelease(kids); }
      }
    }
    return (name ?? "").Replace("\t", " ");
  }

  static string AxString(IntPtr e, string attr) {
    IntPtr v;
    if (AXUIElementCopyAttributeValue(e, Str(attr), out v) != 0 || v == IntPtr.Zero) return null;
    try {
      if (CFGetTypeID(v) != CFStringGetTypeID()) return null;
      byte[] buf = new byte[4096];
      return CFStringGetCString(v, buf, buf.Length, Utf8) ? System.Text.Encoding.UTF8.GetString(buf, 0, Array.IndexOf(buf, (byte)0)) : null;
    } finally { CFRelease(v); }
  }

  // The process a process answers to - a web view's content process, the
  // app it draws for.
  public static int ResponsiblePid(int pid) {
    try { return responsibility_get_pid_responsible_for_pid(pid); } catch (Exception) { return -1; }
  }

  // macOS grants Screen Recording and Accessibility not to this process but
  // to the app it answers to: the terminal it was started from, or whatever
  // spawned that. Knowing which saves a guess in the privacy settings.
  public static string ResponsibleApp() {
    try {
      int pid = responsibility_get_pid_responsible_for_pid(Environment.ProcessId);
      byte[] buf = new byte[4096];
      if (proc_pidpath(pid, buf, (uint)buf.Length) <= 0) return null;
      string path = System.Text.Encoding.UTF8.GetString(buf, 0, Array.IndexOf(buf, (byte)0));
      int app = path.IndexOf(".app/", StringComparison.Ordinal);
      return app < 0 ? path : path.Substring(0, app + 4);
    } catch (Exception) { return null; }
  }

  static void Post(IntPtr e) {
    if (e == IntPtr.Zero) throw new InvalidOperationException("could not make an input event");
    try { CGEventPost(HidTap, e); } finally { CFRelease(e); }
  }

  // The modifier keys the mouse's events say are held (CGEventFlags): a
  // page reads a click's metaKey, shiftKey and altKey off the event itself.
  // Said on every event, none as well: an event that says nothing takes
  // whatever the system last thought was held.
  static ulong Held = 0;

  static IntPtr Mouse(uint type, double x, double y, long clicks, uint button = 0) {
    IntPtr e = CGEventCreateMouseEvent(IntPtr.Zero, type, new CGPoint { X = x, Y = y }, button);
    if (clicks > 0 && e != IntPtr.Zero) CGEventSetIntegerValueField(e, ClickState, clicks);
    if (e != IntPtr.Zero) CGEventSetFlags(e, Held);
    return e;
  }

  public static void MoveTo(double x, double y) { Post(Mouse(EvMoved, x, y, 0)); }
  // A move with the button down has to say so: it is the dragged event, not
  // a move, that a page sees as a pointermove with the button held.
  public static void DragTo(double x, double y) { Post(Mouse(EvLeftDragged, x, y, 0)); }
  // The click count is the poster's to set. Left at one, a double click is
  // two single clicks as far as the page is concerned.
  public static void LeftDown(double x, double y, int click) { Post(Mouse(EvLeftDown, x, y, click)); }
  public static void LeftUp(double x, double y, int click) { Post(Mouse(EvLeftUp, x, y, click)); }
  public static void RightDown(double x, double y) { Post(Mouse(EvRightDown, x, y, 1, RightButton)); }
  public static void RightUp(double x, double y) { Post(Mouse(EvRightUp, x, y, 1, RightButton)); }
  public static void RightDragTo(double x, double y) { Post(Mouse(EvRightDragged, x, y, 0, RightButton)); }

  public static void Scroll(double x, double y, int pixels) {
    IntPtr e = CGEventCreateScrollWheelEvent2(IntPtr.Zero, PixelUnits, 1, pixels, 0, 0);
    if (e != IntPtr.Zero) CGEventSetLocation(e, new CGPoint { X = x, Y = y });
    Post(e);
  }

  // Two fingers on a trackpad: a stroke of small continuous steps, begun,
  // carried on and ended as the trackpad's own are - its first step a
  // pixel or two, however fast the stroke, which is how Meno tells it from
  // a wheel's notch (lib/input/wheel.ts reads a run by its first step).
  // The page sees the opposite sign to the wheel's: a positive dy scrolls
  // down.
  const uint ScrollIsContinuous = 88, ScrollPhase = 99;
  public static void Swipe(double x, double y, int dx, int dy, int steps) {
    for (int i = 0; i <= steps + 1; i++) {
      long phase = i == 0 ? 1 : i > steps ? 4 : 2;   // began, changed, ended
      int sx = phase == 4 ? 0 : dx / steps, sy = phase == 4 ? 0 : dy / steps;
      if (phase == 1) { sx = Math.Sign(dx) * 2; sy = Math.Sign(dy) * 2; }
      IntPtr e = CGEventCreateScrollWheelEvent2(IntPtr.Zero, PixelUnits, 2, -sy, -sx, 0);
      if (e == IntPtr.Zero) continue;
      CGEventSetLocation(e, new CGPoint { X = x, Y = y });
      CGEventSetIntegerValueField(e, ScrollIsContinuous, 1);
      CGEventSetIntegerValueField(e, ScrollPhase, phase);
      Post(e);
      Thread.Sleep(16);
    }
  }

  // Text goes in as Unicode strings on a key event, so it does not depend on
  // the keyboard layout the machine happens to have.
  public static void TypeText(string text) {
    ushort[] units = new ushort[text.Length];
    for (int i = 0; i < text.Length; i++) units[i] = text[i];
    foreach (bool down in new[] { true, false }) {
      IntPtr e = CGEventCreateKeyboardEvent(IntPtr.Zero, 0, down);
      if (e != IntPtr.Zero) { CGEventSetFlags(e, 0); CGEventKeyboardSetUnicodeString(e, (ulong)units.Length, units); }
      Post(e);
    }
  }

  public static void TapKey(ushort key) {
    foreach (bool down in new[] { true, false }) {
      IntPtr e = CGEventCreateKeyboardEvent(IntPtr.Zero, key, down);
      if (e != IntPtr.Zero) CGEventSetFlags(e, 0);
      Post(e);
      if (down) Thread.Sleep(20);
    }
  }

  // A shortcut has to press its modifiers. A key event that only carries the
  // Command flag never reaches the page; the modifier goes down as a key of
  // its own first, and comes up after, the way a hand does it.
  public static void Chord(ushort[] modifiers, ulong[] flags, ushort key) {
    IntPtr src = CGEventSourceCreate(1);        // kCGEventSourceStateHIDSystemState
    try {
      ulong held = 0;
      for (int i = 0; i < modifiers.Length; i++) { held |= flags[i]; ChordKey(src, modifiers[i], true, held); }
      ChordKey(src, key, true, held);
      ChordKey(src, key, false, held);
      for (int i = modifiers.Length - 1; i >= 0; i--) { held &= ~flags[i]; ChordKey(src, modifiers[i], false, held); }
    } finally { if (src != IntPtr.Zero) CFRelease(src); }
  }

  // Modifier keys pressed, in order, or let go, in reverse, around a click
  // or a drag - as keys of their own, as a hand does it, and said by the
  // mouse's events meanwhile.
  public static void HoldKeys(ushort[] codes, ulong[] flags, bool down) {
    IntPtr src = CGEventSourceCreate(1);        // kCGEventSourceStateHIDSystemState
    try {
      if (down) {
        for (int i = 0; i < codes.Length; i++) { Held |= flags[i]; ChordKey(src, codes[i], true, Held); }
      } else {
        for (int i = codes.Length - 1; i >= 0; i--) { Held &= ~flags[i]; ChordKey(src, codes[i], false, Held); }
        Held = 0;
      }
    } finally { if (src != IntPtr.Zero) CFRelease(src); }
  }

  static void ChordKey(IntPtr src, ushort code, bool down, ulong flags) {
    IntPtr e = CGEventCreateKeyboardEvent(src, code, down);
    if (e != IntPtr.Zero) CGEventSetFlags(e, flags);
    Post(e);
    Thread.Sleep(15);
  }
}
'@

# Nothing below works without these, and without them it fails in ways that
# look like something else: a capture that errors, input that goes nowhere.
function Assert-MenoAccess {
    $missing = @()
    if (-not [MacGui]::CGPreflightScreenCaptureAccess()) { $missing += "Screen & System Audio Recording" }
    if (-not [MacGui]::AXIsProcessTrusted()) { $missing += "Accessibility" }
    if ($missing) {
        $app = [MacGui]::ResponsibleApp()
        $who = if ($app) { "'$app'" } else { "the app this is run from (the terminal, or whatever started it)" }
        throw ("macOS has not granted $($missing -join ' or ') to $who. Turn it on in System Settings > " +
            "Privacy & Security, then start the run again. If it asks to quit and reopen the app, 'Later' will do: " +
            "a new pwsh picks the permission up.")
    }
}
Assert-MenoAccess

$script:Window = [uint32] 0
$script:MenoPid = 0
# (whether the web view has built its page's parts for Accessibility, which it does only once asked: the guard's first lookup in a run waits for them)
$script:PageRead = $false
# Pixels of a shot per point of screen: 2 on a Retina display. Measured off a
# real shot rather than assumed; see Get-ShotScale.
$script:Scale = 0.0

function Get-MenoBuild {
    # Where `npm run tauri build` leaves the app on this platform.
    return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../../src-tauri/target/release/bundle/macos/Meno.app"))
}

function Get-MenoProfile {
    # The folder of the Meno under test's settings, its settings.json in it (src-tauri/src/folders.rs, data_dir).
    return Join-Path $HOME "Library/Application Support/Meno"
}

function Start-MenoProcess {
    <#
      .SYNOPSIS
      Start a build: an app bundle through Launch Services, the way it is
      started from the Finder, or a bare executable as it is.
    #>
    param([Parameter(Mandatory)] [string] $Path)
    if ((Test-Path -PathType Container $Path) -and $Path.TrimEnd("/").EndsWith(".app")) {
        & /usr/bin/open -n $Path
        if ($LASTEXITCODE -ne 0) { throw "open could not start '$Path'" }
    } else {
        Start-Process -FilePath $Path | Out-Null
    }
}

function Close-MenoProcess {
    <#
      .SYNOPSIS
      Ask a running copy to quit, and put it down if it will not.
    #>
    param([Parameter(Mandatory)] [System.Diagnostics.Process] $Process)
    [MacGui]::Terminate($Process.Id) | Out-Null
    if (-not $Process.WaitForExit(4000)) { $Process.Kill() }
}

function Get-MenoWindow {
    <#
      .SYNOPSIS
      The main window of a running process, waited for rather than assumed:
      a freshly started app has no window for a second or two.
    #>
    param(
        [string] $ProcessName = "Meno",
        [int] $TimeoutSec = 30
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        foreach ($p in @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)) {
            $w = [MacGui]::MainWindowOf($p.Id)
            if ($w) {
                # (a new copy of Meno: its page's parts asked for again before the guard trusts a lookup)
                if ($script:MenoPid -ne $p.Id) { $script:PageRead = $false }
                $script:MenoPid = $p.Id
                $script:Window = $w.Id
                return $script:Window
            }
        }
        Start-Sleep -Milliseconds 250
    }
    throw "no window for process '$ProcessName' after ${TimeoutSec}s"
}

function Get-WindowInfo {
    if ($script:Window -eq 0) { throw "call Get-MenoWindow first" }
    $w = [MacGui]::WindowById($script:Window)
    if (-not $w) { throw "Meno's window ($script:Window) is not on screen any more" }
    return $w
}

function Get-FrontPid {
    <#
      .SYNOPSIS
      The process of the app in front now, as Launch Services has it (0 where
      none is to be had).

      .DESCRIPTION
      Asked of lsappinfo each time, not of NSWorkspace's frontmostApplication:
      that is kept up to date by notifications on a run loop this process
      never runs, and stayed on a Meno that had quit for as long as it was
      asked (2026-10-29) - a Meno started again, and in front, was taken for
      one that would not come forward.
    #>
    $asn = ((& /usr/bin/lsappinfo front) -join "").Trim()
    if (-not $asn) { return 0 }
    $info = (& /usr/bin/lsappinfo info -only pid $asn) -join " "
    if ($info -match '\bpid"?\s*=\s*(\d+)') { return [int]$Matches[1] }
    return 0
}

function Wait-MenoFront {
    param([int] $TimeoutMs = 2000)
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    do {
        if ((Get-FrontPid) -eq $script:MenoPid) { return $true }
        Start-Sleep -Milliseconds 100
    } while ((Get-Date) -lt $deadline)
    return $false
}

# The windows of the system's own that may float over Meno and take input
# meant for it: a password or authorization prompt, a notification, an
# accessibility warning (2026-10-14: three clicks of a run landed on an
# authorization prompt, left up on screen by something else).
# By their executables' names, which are not put into the user's language as
# the windows' owners are.
$script:SystemExes = @("SecurityAgent", "UserNotificationCenter", "coreauthd", "universalAccessAuthWarn")

function Find-SystemWindow {
    <#
      .SYNOPSIS
      The first window of `$Windows (front to back, as [MacGui]::Windows()
      lists them) that is the system's - by its owner's executable, or set at
      layer 1000 or higher, over every app's - or $null. The Window Server's
      own small marks at the top layer (the recording dot, the pointer, which
      it lists after a synthetic move), no larger than 64x64 pt, are no such
      window.
    #>
    param([AllowEmptyCollection()] [object[]] $Windows)
    foreach ($w in $Windows) {
        if ($script:SystemExes -contains $w.Exe) { return $w }
        $mark = $w.Owner -eq "Window Server" -and $w.Layer -eq 2147483630 -and $w.Width -le 64 -and $w.Height -le 64
        if ($w.Layer -ge 1000 -and -not $mark) { return $w }
    }
    return $null
}

function Find-WindowAt {
    <#
      .SYNOPSIS
      The window in front at a point in global points, of `$Windows listed
      front to back - the one a click there would land in - or $null; where
      Accessibility cannot say (`[MacGui]::PidAt`), what the guard goes by.
      The Window Server's own marks, windows below the desktop's, and a host
      over the whole screen above the apps' windows - Notification Center's,
      empty, which clicks go through - are left out.
    #>
    param([AllowEmptyCollection()] [object[]] $Windows, [double] $X, [double] $Y)
    foreach ($w in $Windows) {
        if ($w.Layer -lt 0 -or $w.Owner -eq "Window Server") { continue }
        if ($w.Layer -gt 0 -and $w.Layer -lt 1000 -and $w.X -le 0 -and $w.Y -le 0 -and $w.Width -ge 1000 -and $w.Height -ge 700) { continue }
        if ($X -ge $w.X -and $X -lt $w.X + $w.Width -and $Y -ge $w.Y -and $Y -lt $w.Y + $w.Height) { return $w }
    }
    return $null
}

# The windows on screen, listed again at most every 200 ms: every input asks,
# and a list takes a few milliseconds.
$script:ScreenWindows = $null
$script:ScreenWindowsAt = [datetime]::MinValue

function Get-ScreenWindows {
    param([switch] $Again)
    $now = [datetime]::UtcNow
    if ($Again -or $null -eq $script:ScreenWindows -or ($now - $script:ScreenWindowsAt).TotalMilliseconds -gt 200) {
        $script:ScreenWindows = @([MacGui]::Windows())
        $script:ScreenWindowsAt = $now
    }
    return , $script:ScreenWindows
}

function Assert-MenoFront {
    <#
      .SYNOPSIS
      Stop before input that would not go to Meno: with another app in
      front, with a window of the system's up anywhere on screen, or - given
      the point a click, a drag or a wheel is sent at, in global points -
      with that point on a window that is not Meno's.
    #>
    param($At)
    # Input goes to whichever app is in front and to whichever window is
    # under the pointer, not to Meno by name. If Meno has lost the front, the
    # next keystroke lands in some other app, so stop rather than send it.
    if ((Get-FrontPid) -ne $script:MenoPid) {
        $front = [MacGui]::AppName((Get-FrontPid))
        throw "Meno is no longer in front - '$front' is - and input sent now would go there. Stopping."
    }
    # (a system window - a password prompt - can float over Meno with Meno
    # still the app in front: a key or a click sent now could answer it)
    $windows = Get-ScreenWindows
    $system = Find-SystemWindow $windows
    # (seen in a list up to 200 ms old: looked for again before stopping)
    if ($system) {
        $windows = Get-ScreenWindows -Again
        $system = Find-SystemWindow $windows
    }
    if ($system) {
        throw ("A window of the system's is on screen - '$($system.Owner)', layer $($system.Layer), at ($([int]$system.X), $([int]$system.Y)), " +
            "$([int]$system.Width)x$([int]$system.Height) pt - and input sent now could land in it. Stopping; nothing was sent. " +
            "Leave it to whoever it is for, and run again once it is gone.")
    }
    if ($At) {
        # (as Accessibility sees the point - through a window clicks go by -
        # Meno's, or a process drawing for it, a web view's; where it cannot
        # tell, the window in front there)
        $hit = [MacGui]::PidAt($At.X, $At.Y)
        $ok = if ($hit -gt 0) { $hit -eq $script:MenoPid -or [MacGui]::ResponsiblePid($hit) -eq $script:MenoPid } else { $null }
        if ($null -eq $ok) {
            $top = Find-WindowAt $windows $At.X $At.Y
            $ok = [bool]($top -and $top.Pid -eq $script:MenoPid)
            $whose = if ($top) { "'$($top.Owner)'" } else { "nothing" }
        } else {
            $whose = "'$([MacGui]::AppName($hit))'"
        }
        if (-not $ok) {
            throw "The point ($([int]$At.X), $([int]$At.Y)) pt is not on Meno's window - $whose is there - so input sent at it would not go to Meno. Stopping; nothing was sent."
        }
    }
}

function Read-MacPart([scriptblock] $Lookup) {
    # A lookup of [MacGui]'s, as the guard takes it (Read-Part): its error, or its chain.
    Read-Part {
        $l = & $Lookup
        if ($l.Error) { throw $l.Error }
        [pscustomobject]@{ Chain = $l.Chain }
    }
}

function Wait-PageRead {
    <#
      .SYNOPSIS
      Before the guard's first lookup in a run: the page's parts asked for at
      the window's middle until the hit test reaches one (some 3 s the first
      time), or a failed reading where it never does - a lookup that lands
      on the page itself then says nothing of what is on it.
    #>
    if ($script:PageRead) { return $null }
    $w = Get-WindowInfo
    $until = (Get-Date).AddSeconds(5)
    do {
        $look = Read-MacPart { [MacGui]::ChainAt($w.X + $w.Width / 2, $w.Y + $w.Height / 2) }
        if (-not $look.Unread -and (Test-PageReached -Chain $look.Chain)) { $script:PageRead = $true; return $null }
        Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $until)
    return [pscustomobject]@{ Chain = @(); Unread = "the page's parts were not there to read in 5 s" }
}

function Assert-NotYesAt {
    # A press at a point, in global points, that would answer a question about the network yes - or that could not be read - stopped before it is sent (MenoConsent.psm1).
    param([Parameter(Mandatory)] $At, [string] $What = "a press")
    $look = Wait-PageRead
    if (-not $look) { $look = Read-MacPart { [MacGui]::ChainAt($At.X, $At.Y) } }
    Assert-NotNetworkYes -Look $look -What "$What at ($([int]$At.X), $([int]$At.Y)) pt"
}

function Assert-NotYesKeys {
    # Keys sent while a question about the network has its yes in focus - or while what has the keys could not be read - stopped before they are sent (MenoConsent.psm1).
    param([Parameter(Mandatory)] [string] $What)
    $look = Wait-PageRead
    if (-not $look) { $look = Read-MacPart { [MacGui]::FocusedChain($script:MenoPid) } }
    Assert-NotNetworkYes -Look $look -What $What
}

function Set-MenoWindow {
    <#
      .SYNOPSIS
      Bring the window forward and put it at a known size, so that a
      screenshot taken now and one taken next week can be compared.

      .DESCRIPTION
      The size is in points, the unit macOS sizes windows in: 1280x860 is a
      2560x1720 shot on a Retina display. Every other number in this module is
      a pixel of that shot.
    #>
    param(
        [int] $Width = 1280,
        [int] $Height = 860,
        [int] $Left = 40,
        [int] $Top = 40
    )
    Get-WindowInfo | Out-Null
    [MacGui]::Activate($script:MenoPid) | Out-Null
    [MacGui]::Place($script:MenoPid, $script:Window, $Left, $Top, $Width, $Height)
    # (the windows listed for the guard, as they were before it moved)
    $script:ScreenWindows = $null
    Start-Sleep -Milliseconds 400
    $w = Get-WindowInfo
    if ([math]::Abs($w.Width - $Width) -ge 1 -or [math]::Abs($w.Height - $Height) -ge 1) {
        throw ("asked for a ${Width}x${Height} window and got $($w.Width)x$($w.Height). macOS keeps a window " +
            "inside the screen, and the app has a minimum size; the scenarios' coordinates are only good at the size they were read at.")
    }
    if (-not (Wait-MenoFront)) {
        [MacGui]::Activate($script:MenoPid) | Out-Null
        if (-not (Wait-MenoFront)) {
            throw "the window would not come to the front, so input would go to '$([MacGui]::AppName((Get-FrontPid)))' instead. Check that the screen is unlocked."
        }
    }
    # The window may have moved to another display.
    $script:Scale = 0.0
    Get-ShotScale | Out-Null
}

function Get-ShotScale {
    # The one number the coordinates hang on, taken from a real shot: how many
    # of its pixels there are to a point of screen.
    if ($script:Scale -le 0) {
        $w = Get-WindowInfo
        $probe = Join-Path ([System.IO.Path]::GetTempPath()) "meno-scale.png"
        Save-MenoShot -Path $probe | Out-Null
        $script:Scale = (Get-PngWidth $probe) / $w.Width
    }
    return $script:Scale
}

function Get-PngWidth {
    param([Parameter(Mandatory)] [string] $Path)
    $b = [System.IO.File]::ReadAllBytes($Path)
    return ([int] $b[16] -shl 24) -bor ([int] $b[17] -shl 16) -bor ([int] $b[18] -shl 8) -bor [int] $b[19]
}

function Get-ClientOrigin {
    # Where the window's top left is on the screen, in points. The window is
    # all client: the app draws its own title bar.
    $w = Get-WindowInfo
    return @{ X = $w.X; Y = $w.Y }
}

function Get-ClientSize {
    # In pixels of a shot, like every coordinate a scenario passes in.
    $w = Get-WindowInfo
    $k = Get-ShotScale
    return @{ Width = [int][math]::Round($w.Width * $k); Height = [int][math]::Round($w.Height * $k) }
}

function ConvertTo-Screen {
    param([int] $X, [int] $Y)
    $w = Get-WindowInfo
    $k = Get-ShotScale
    if ($X -lt 0 -or $Y -lt 0 -or $X -ge $w.Width * $k -or $Y -ge $w.Height * $k) {
        throw "($X, $Y) is outside the window, which is $([int]($w.Width * $k))x$([int]($w.Height * $k)) in shot pixels"
    }
    return @{ X = $w.X + $X / $k; Y = $w.Y + $Y / $k }
}

function Save-WindowShot {
    param([Parameter(Mandatory)] [uint32] $Id, [Parameter(Mandatory)] [string] $Path)
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    # -o leaves the shadow out, -x the shutter sound.
    $err = & /usr/sbin/screencapture -l $Id -o -x $Path 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Path)) {
        throw "screencapture could not take window $Id ($err). Either the window has gone, or Screen Recording has not been granted."
    }
    return $Path
}

function Save-MenoShot {
    <#
      .SYNOPSIS
      The window's picture, taken out of the window itself.

      .DESCRIPTION
      Unlike on Windows this reads the window's own contents from the window
      server, GPU-drawn parts and all, so another window over it does not end
      up in the shot. It does not have to be in front for this; it does have
      to be for input.
    #>
    param([Parameter(Mandatory)] [string] $Path)
    Get-WindowInfo | Out-Null
    return Save-WindowShot -Id $script:Window -Path $Path
}

function Set-HeldKeys {
    # -Hold's names pressed, or let go: Shortcut is Command here, Ctrl on
    # Windows; Alt is Option.
    param([string[]] $Hold, [switch] $Up)
    $codes = @{ Shortcut = 55; Shift = 56; Alt = 58 }
    $flags = @{ Shortcut = 0x100000; Shift = 0x20000; Alt = 0x80000 }
    [MacGui]::HoldKeys([uint16[]] @($Hold | ForEach-Object { $codes[$_] }), [uint64[]] @($Hold | ForEach-Object { $flags[$_] }), -not $Up)
}

function Invoke-MenoClick {
    <#
      .SYNOPSIS
      Click - or right-click - at a point, with the modifier keys -Hold names
      held: Shortcut (Command here, Ctrl on Windows), Shift, Alt (Option).
    #>
    param(
        [Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y, [int] $Count = 1, [switch] $Right,
        [ValidateSet("Shortcut", "Shift", "Alt")] [string[]] $Hold = @()
    )
    $p = ConvertTo-Screen $X $Y
    Assert-MenoFront -At $p
    Assert-NotYesAt -At $p -What "a click"
    Set-HeldKeys $Hold
    try { Invoke-MacClick $p $Count $Right } finally { Set-HeldKeys $Hold -Up }
}

function Invoke-MacClick($p, [int] $Count, [bool] $Right) {
    [MacGui]::MoveTo($p.X, $p.Y)
    Start-Sleep -Milliseconds 30
    if ($Right) {
        [MacGui]::RightDown($p.X, $p.Y)
        Start-Sleep -Milliseconds 30
        [MacGui]::RightUp($p.X, $p.Y)
        Start-Sleep -Milliseconds 120
        return
    }
    for ($i = 1; $i -le $Count; $i++) {
        [MacGui]::LeftDown($p.X, $p.Y, $i)
        Start-Sleep -Milliseconds 30
        [MacGui]::LeftUp($p.X, $p.Y, $i)
        if ($i -lt $Count) { Start-Sleep -Milliseconds 90 }
    }
    Start-Sleep -Milliseconds 120
}

function Invoke-MenoDrag {
    <#
      .SYNOPSIS
      Press, travel, release - with the travel broken into steps.

      .DESCRIPTION
      A jump straight from one point to the other is a single pointermove, and
      the editor asks for several: it waits a few pixels before it calls a
      press a drag at all, and the preview it draws follows the moves rather
      than the release.

      -Count 2 makes the press the second click of a double-click, as the
      system counts clicks: the drag after an Invoke-MenoClick on the same
      point. Here the poster says how many clicks a press is, and the page
      sees what it says.

      -Hold names the modifier keys held through it, as Invoke-MenoClick's;
      -Via, points it passes through on its way, @(@(x, y), ...) - a lasso's;
      -PressMs, how long the button is held still before it travels: 600
      makes the press a long press.
    #>
    param(
        [Parameter(Mandatory)] [int] $FromX, [Parameter(Mandatory)] [int] $FromY,
        [Parameter(Mandatory)] [int] $ToX, [Parameter(Mandatory)] [int] $ToY,
        [int] $Steps = 12,
        [int] $StepMs = 25,
        [int] $PressMs = 80,
        [int] $Count = 1,
        [scriptblock] $AtStep,
        [switch] $Right,
        [ValidateSet("Shortcut", "Shift", "Alt")] [string[]] $Hold = @(),
        [int[][]] $Via = @()
    )
    $a = ConvertTo-Screen $FromX $FromY
    $b = ConvertTo-Screen $ToX $ToY
    $path = Get-DragPath $FromX $FromY $Via $ToX $ToY $Steps
    Assert-MenoFront -At $a
    # (where the button goes down and where it comes up)
    Assert-NotYesAt -At $a -What "a drag's press"
    Assert-NotYesAt -At $b -What "a drag's end"
    Set-HeldKeys $Hold
    try { Invoke-MacDrag $a $b $path $StepMs $PressMs $Count $AtStep $Right } finally { Set-HeldKeys $Hold -Up }
}

function Get-DragPath {
    # The points a drag passes through, in client coordinates: -Steps of them
    # on each leg, from the start through each of -Via to the end.
    param([int] $FromX, [int] $FromY, [int[][]] $Via, [int] $ToX, [int] $ToY, [int] $Steps)
    $corners = @(, @($FromX, $FromY)) + @($Via | Where-Object { $_ }) + @(, @($ToX, $ToY))
    $path = @()
    for ($k = 1; $k -lt $corners.Count; $k++) {
        $p = $corners[$k - 1]; $q = $corners[$k]
        for ($i = 1; $i -le $Steps; $i++) {
            $t = $i / $Steps
            $path += , @([int]($p[0] + ($q[0] - $p[0]) * $t), [int]($p[1] + ($q[1] - $p[1]) * $t))
        }
    }
    return , $path
}

function Invoke-MacDrag($a, $b, $path, [int] $StepMs, [int] $PressMs, [int] $Count, [scriptblock] $AtStep, [bool] $Right) {
    [MacGui]::MoveTo($a.X, $a.Y)
    Start-Sleep -Milliseconds 80
    if ($Right) { [MacGui]::RightDown($a.X, $a.Y) } else { [MacGui]::LeftDown($a.X, $a.Y, $Count) }
    Start-Sleep -Milliseconds $PressMs
    try {
        for ($i = 1; $i -le $path.Count; $i++) {
            $p = ConvertTo-Screen $path[$i - 1][0] $path[$i - 1][1]
            if ($Right) { [MacGui]::RightDragTo($p.X, $p.Y) } else { [MacGui]::DragTo($p.X, $p.Y) }
            Start-Sleep -Milliseconds $StepMs
            if ($AtStep) { & $AtStep $i }
        }
    } finally {
        # Let go whatever happened: a button left down is a button held down
        # for every app on the machine.
        if ($Right) { [MacGui]::RightUp($b.X, $b.Y) } else { [MacGui]::LeftUp($b.X, $b.Y, $Count) }
    }
    Start-Sleep -Milliseconds 200
}

function Move-MenoPointer {
    <#
      .SYNOPSIS
      Put the pointer over a point and leave it there: hover.

      .DESCRIPTION
      It arrives from a few pixels to the left, so the page sees a move over
      the point rather than a pointer that was simply found there.
    #>
    param([Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y)
    $p = ConvertTo-Screen $X $Y
    Assert-MenoFront
    [MacGui]::MoveTo($p.X - 4, $p.Y)
    Start-Sleep -Milliseconds 60
    [MacGui]::MoveTo($p.X, $p.Y)
    Start-Sleep -Milliseconds 200
}

function Move-MenoPointerAlong {
    <#
      .SYNOPSIS
      Lead the pointer through points with no button down, as a hand would:
      a chain traced with the button up.

      .DESCRIPTION
      Each point is one move, straight on from the one before - not arrived
      at from the side, as Move-MenoPointer's is, which would make the way
      traced a zigzag. -AtStep is called after each, with its number: where
      a screenshot on the way goes.
    #>
    param([Parameter(Mandatory)] [int[][]] $Path, [int] $StepMs = 25, [scriptblock] $AtStep)
    Assert-MenoFront
    for ($i = 1; $i -le $Path.Count; $i++) {
        $p = ConvertTo-Screen $Path[$i - 1][0] $Path[$i - 1][1]
        [MacGui]::MoveTo($p.X, $p.Y)
        Start-Sleep -Milliseconds $StepMs
        if ($AtStep) { & $AtStep $i }
    }
    Start-Sleep -Milliseconds 200
}

function Invoke-MenoSwipe {
    <#
      .SYNOPSIS
      Two fingers on a trackpad over a point: scroll by DX, DY pixels in small
      steps. A positive DY scrolls down, as it would a page.

      -Held swipes where the pointer already is, without moving it there
      first: with a button held down, in a drag's -AtStep, a move would be
      the drag's.
    #>
    param(
        [Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y,
        [int] $DX = 0, [int] $DY = 0, [int] $Steps = 10, [switch] $Held
    )
    $p = ConvertTo-Screen $X $Y
    Assert-MenoFront -At $p
    if (-not $Held) {
        [MacGui]::MoveTo($p.X, $p.Y)
        Start-Sleep -Milliseconds 60
    }
    [MacGui]::Swipe($p.X, $p.Y, $DX, $DY, $Steps)
    Start-Sleep -Milliseconds 200
}

function Invoke-MenoWheel {
    <#
      .SYNOPSIS
      Turn the wheel over a point: positive notches upwards, as a page reads
      a turn (a wheel event's deltaY below 0), negative downwards - the same
      on every machine. Which way that zooms is Meno's Settings' to say
      (General, The wheel turned upwards): to zoom by what is meant, in or
      out, Invoke-MenoZoom.

      .DESCRIPTION
      A notch is posted as 100 pixels of scroll, which is what Chromium, and so
      WebView2, hands a page for one notch of a Windows wheel at the usual
      three lines a notch. The Mac's own unit, a line, reaches the page
      through WebKit as 40, so posting lines would have the same scenario zoom
      less than half as far here.
    #>
    param([Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y, [int] $Notches = 1)
    $p = ConvertTo-Screen $X $Y
    Assert-MenoFront -At $p
    [MacGui]::MoveTo($p.X, $p.Y)
    Start-Sleep -Milliseconds 60
    [MacGui]::Scroll($p.X, $p.Y, $Notches * 100)
    Start-Sleep -Milliseconds 200
}

function Send-MenoText {
    param([Parameter(Mandatory)] [string] $Text, [int] $CharMs = 8)
    Assert-MenoFront
    Assert-NotYesKeys -What "typing"
    # A character at a time, but never half of one.
    $e = [System.Globalization.StringInfo]::GetTextElementEnumerator($Text)
    while ($e.MoveNext()) {
        [MacGui]::TypeText($e.GetTextElement())
        Start-Sleep -Milliseconds $CharMs
    }
}

function Send-MenoKey {
    param([Parameter(Mandatory)] [ValidateSet("Enter", "Escape", "Tab", "Backspace", "Up", "Down")] [string] $Key, [switch] $Shift)
    Assert-MenoFront
    # (Escape answers a question no: always let through)
    if ($Key -ne "Escape") { Assert-NotYesKeys -What "the $Key key" }
    # Virtual key codes of the ANSI layout; these are the same on all of them.
    $code = @{ Enter = 36; Escape = 53; Tab = 48; Backspace = 51; Up = 126; Down = 125 }[$Key]
    # (with Shift, if asked: Shift+Enter)
    if ($Shift) { [MacGui]::Chord([uint16[]] @(56), [uint64[]] @(0x20000), [uint16] $code) }
    else { [MacGui]::TapKey([uint16] $code) }
    Start-Sleep -Milliseconds 150
}

function Send-MenoShortcut {
    <#
      .SYNOPSIS
      The platform's shortcut key - Cmd here, Ctrl on Windows - with a letter
      or a digit, and Shift if asked: Send-MenoShortcut Z is undo.
    #>
    param([Parameter(Mandatory)] [ValidatePattern("^[A-Za-z0-9]$")] [string] $Key, [switch] $Shift)
    Assert-MenoFront
    Assert-NotYesKeys -What "a shortcut"
    # Virtual key codes of the ANSI layout, which is where letters and digits
    # sit on the others too.
    $codes = @{
        A = 0; S = 1; D = 2; F = 3; H = 4; G = 5; Z = 6; X = 7; C = 8; V = 9; B = 11; Q = 12; W = 13
        E = 14; R = 15; Y = 16; T = 17; O = 31; U = 32; I = 34; P = 35; L = 37; J = 38; K = 40; N = 45; M = 46
        "1" = 18; "2" = 19; "3" = 20; "4" = 21; "5" = 23; "6" = 22; "7" = 26; "8" = 28; "9" = 25; "0" = 29
    }
    $mods = @([uint16] 55); $flags = @([uint64] 0x100000)          # Command
    if ($Shift) { $mods += [uint16] 56; $flags += [uint64] 0x20000 } # Shift
    [MacGui]::Chord([uint16[]] $mods, [uint64[]] $flags, [uint16] $codes[$Key.ToUpperInvariant()])
    Start-Sleep -Milliseconds 150
}

function Get-DialogWindows {
    # The system's file panels, and the sheets they open over themselves, are
    # windows of the app's own besides its main one: the open panel above the
    # ordinary level, the save panel on it. So is a tooltip - the fit button
    # has one - which is the reason for the size.
    return @([MacGui]::Windows() | Where-Object {
        $_.Pid -eq $script:MenoPid -and $_.Id -ne $script:Window -and $_.Width -ge 200 -and $_.Height -ge 100 })
}

function Wait-DialogWindows {
    param([Parameter(Mandatory)] [scriptblock] $Until, [Parameter(Mandatory)] [string] $What, [int] $TimeoutMs = 8000)
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    do {
        $d = @(Get-DialogWindows)
        if (& $Until $d) { return ,$d }
        Start-Sleep -Milliseconds 100
    } while ((Get-Date) -lt $deadline)
    throw "waited ${TimeoutMs}ms for $What"
}

function Wait-WindowSettled {
    param([Parameter(Mandatory)] [uint32] $Id, [int] $TimeoutMs = 4000, [int] $QuietMs = 400)
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "meno-settle"
    New-Item -ItemType Directory -Force $tmp | Out-Null
    $a = Join-Path $tmp "a.png"
    $b = Join-Path $tmp "b.png"
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    Save-WindowShot -Id $Id -Path $a | Out-Null
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds $QuietMs
        Save-WindowShot -Id $Id -Path $b | Out-Null
        if ((Get-FileHash $a).Hash -eq (Get-FileHash $b).Hash) { return $true }
        Copy-Item $b $a -Force
    }
    return $false
}

function Complete-FileDialog {
    <#
      .SYNOPSIS
      The system's open panel is up: choose this file in it.

      .DESCRIPTION
      The panel has no field to type a path into until '/' opens the "Go to
      the folder" sheet, and that sheet takes a moment to arrive. What is
      typed before it has does get into the field, but the sheet never looks
      it up, and Return then does nothing at all. So: '/', wait for the sheet
      to be a window, the rest of the path, wait for the lookup to show, then
      Return to go there - which leaves the file selected - and Return again
      to open it. With -All, every file in that file's folder is chosen
      (Cmd+A) before Return, to open several at once.
    #>
    param([Parameter(Mandatory)] [string] $Path, [switch] $All)
    if (-not $Path.StartsWith("/")) { throw "the path has to be absolute: '$Path'" }
    $panel = Wait-DialogWindows -What "the open panel" -Until { param($d) $d.Count -ge 1 }
    $before = $panel.Count
    # The panel is a window before it takes keys: a '/' sent while it is still
    # sliding in goes nowhere. Let it come to rest first, and if the sheet
    # still does not come, ask again - but only while there is no sheet, or
    # the second '/' would land in its field.
    Wait-WindowSettled -Id $panel[0].Id -TimeoutMs 3000 -QuietMs 250 | Out-Null
    $sheet = $null
    for ($try = 1; $try -le 3 -and -not $sheet; $try++) {
        Send-MenoText -Text "/"
        try {
            $sheet = Wait-DialogWindows -What "the 'Go to the folder' sheet" -TimeoutMs 2500 -Until { param($d) $d.Count -gt $before }.GetNewClosure()
        } catch {
            if ($try -eq 3) { throw }
        }
    }
    Start-Sleep -Milliseconds 300
    Send-MenoText -Text $Path.Substring(1)
    # The suggestion under the field is the lookup having happened; wait for
    # the sheet to stop changing, but not less than the time it takes to begin.
    $new = $sheet | Where-Object { $_.Id -notin $panel.Id } | Select-Object -First 1
    Start-Sleep -Milliseconds 600
    Wait-WindowSettled -Id $new.Id -TimeoutMs 4000 -QuietMs 300 | Out-Null
    Send-MenoKey -Key Enter
    Wait-DialogWindows -What "the sheet to take the path (it shows no suggestion when it has not looked the path up)" -Until { param($d) $d.Count -le $before }.GetNewClosure() | Out-Null
    Start-Sleep -Milliseconds 500
    if ($All) {
        Send-MenoShortcut -Key A
        Start-Sleep -Milliseconds 400
    }
    Send-MenoKey -Key Enter
    Wait-DialogWindows -What "the open panel to close" -Until { param($d) $d.Count -eq 0 } | Out-Null
}

function Complete-SaveDialog {
    <#
      .SYNOPSIS
      The system's save panel is up: save under this path in it.

      .DESCRIPTION
      The panel opens with its name chosen in its name field, so the file's
      name is typed over it. A '/' typed there would go into the name, not
      open the "Go to the folder" sheet as it does in the open panel, so the
      sheet is asked for with Command-Shift-G, waited for as the open panel's
      is, given the folder (over whatever it last held), and gone with
      Return. Return again saves, and the panel has to go: a name it would
      not take, or a file already there, brings up a sheet that keeps it.
    #>
    param([Parameter(Mandatory)] [string] $Path)
    if (-not $Path.StartsWith("/")) { throw "the path has to be absolute: '$Path'" }
    $folder = Split-Path -Parent $Path
    $name = Split-Path -Leaf $Path
    $panel = Wait-DialogWindows -What "the save panel" -Until { param($d) $d.Count -ge 1 }
    $before = $panel.Count
    Wait-WindowSettled -Id $panel[0].Id -TimeoutMs 3000 -QuietMs 250 | Out-Null
    Send-MenoShortcut A
    Send-MenoText -Text $name
    Start-Sleep -Milliseconds 300
    $sheet = $null
    for ($try = 1; $try -le 3 -and -not $sheet; $try++) {
        Send-MenoShortcut G -Shift
        try {
            $sheet = Wait-DialogWindows -What "the 'Go to the folder' sheet" -TimeoutMs 2500 -Until { param($d) $d.Count -gt $before }.GetNewClosure()
        } catch {
            if ($try -eq 3) { throw }
        }
    }
    Start-Sleep -Milliseconds 300
    Send-MenoShortcut A
    Send-MenoText -Text $folder
    $new = $sheet | Where-Object { $_.Id -notin $panel.Id } | Select-Object -First 1
    Start-Sleep -Milliseconds 600
    Wait-WindowSettled -Id $new.Id -TimeoutMs 4000 -QuietMs 300 | Out-Null
    Send-MenoKey -Key Enter
    Wait-DialogWindows -What "the sheet to take the folder" -Until { param($d) $d.Count -le $before }.GetNewClosure() | Out-Null
    Start-Sleep -Milliseconds 500
    Send-MenoKey -Key Enter
    Wait-DialogWindows -What "the save panel to close (a sheet may be asking whether to replace a file)" -Until { param($d) $d.Count -eq 0 } | Out-Null
}

function Wait-MenoSettled {
    <#
      .SYNOPSIS
      Wait until the drawing stops changing, rather than sleeping a guess.
      Animations here run for a few hundred milliseconds after a gesture.
    #>
    param([int] $TimeoutMs = 4000, [int] $QuietMs = 400)
    Get-WindowInfo | Out-Null
    if (Wait-WindowSettled -Id $script:Window -TimeoutMs $TimeoutMs -QuietMs $QuietMs) { return $true }
    Write-Warning "the drawing was still changing after ${TimeoutMs}ms"
    return $false
}

Export-ModuleMember -Function Get-MenoBuild, Get-MenoProfile, Start-MenoProcess, Close-MenoProcess, Complete-FileDialog, Complete-SaveDialog,
    Get-MenoWindow, Set-MenoWindow, Get-ClientOrigin, Get-ClientSize,
    ConvertTo-Screen, Save-MenoShot, Invoke-MenoClick, Invoke-MenoDrag, Move-MenoPointer, Move-MenoPointerAlong, Invoke-MenoWheel, Invoke-MenoSwipe,
    Send-MenoText, Send-MenoKey, Send-MenoShortcut, Wait-MenoSettled,
    # (the guard's two readings of the window list, for scripts/gui/tests/guard.tests.ps1)
    Find-SystemWindow, Find-WindowAt
