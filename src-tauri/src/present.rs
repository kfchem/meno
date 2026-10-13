//! The window given over to a talk (docs/PRESENTING.md): made to cover its
//! screen - on a Mac over the screen where it is, its menu bar and Dock
//! hidden, as slides software plays a talk, not in a space of its own the
//! system slides to; elsewhere the system's full screen - and back.

/// What a talk was given: whether the window was made to cover its screen
/// (or put back), and how far down from the screen's top a slide is clear
/// of what the screen keeps there - a Mac's notch - in points.
#[derive(serde::Serialize)]
pub struct Presented {
    made: bool,
    top: f64,
}

/// The window made to cover its screen, or back. One the system already
/// shows full screen is left as it is.
#[tauri::command]
pub fn present_window(window: tauri::WebviewWindow, on: bool) -> Result<Presented, String> {
    if on && window.is_fullscreen().map_err(|e| e.to_string())? {
        return Ok(Presented { made: false, top: 0.0 });
    }
    #[cfg(target_os = "macos")]
    {
        // (with_webview runs it at once here, on the main thread, where a command is run)
        let top = std::sync::Arc::new(std::sync::Mutex::new(0.0));
        let told = top.clone();
        window
            .with_webview(move |w| *told.lock().unwrap_or_else(|e| e.into_inner()) = mac::talk_window(&w, on))
            .map_err(|e| e.to_string())?;
        let top = *top.lock().unwrap_or_else(|e| e.into_inner());
        Ok(Presented { made: true, top })
    }
    #[cfg(not(target_os = "macos"))]
    {
        window.set_simple_fullscreen(on).map_err(|e| e.to_string())?;
        let _ = window.set_focus();
        Ok(Presented { made: true, top: 0.0 })
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2::rc::Retained;
    use objc2::{define_class, msg_send, MainThreadMarker, MainThreadOnly, Message};
    use objc2_app_kit::{NSApplication, NSApplicationPresentationOptions as Options, NSBackingStoreType, NSColor, NSResponder, NSView, NSWindow, NSWindowStyleMask};
    use objc2_foundation::NSObject;
    use std::cell::RefCell;

    define_class!(
        // SAFETY: NSWindow may be subclassed; this adds no instance
        // variables and does not implement Drop.
        #[unsafe(super(NSWindow, NSResponder, NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "MenoTalkWindow"]
        struct TalkWindow;

        impl TalkWindow {
            // (borderless, yet the talk's keys its own)
            #[unsafe(method(canBecomeKeyWindow))]
            fn can_become_key(&self) -> bool {
                true
            }

            #[unsafe(method(canBecomeMainWindow))]
            fn can_become_main(&self) -> bool {
                true
            }
        }
    );

    struct Talk {
        window: Retained<TalkWindow>,
        /// The window the page was given over from - the webview's own, to which it goes back.
        main: Retained<NSWindow>,
        options: Options,
    }

    thread_local! {
        static TALK: RefCell<Option<Talk>> = const { RefCell::new(None) };
    }

    /// The page given over to a window of a talk's own over the whole of
    /// its screen - borderless, its corners square, over the notch's band
    /// too, the menu bar and Dock hidden, as slides software plays a talk -
    /// and back to its own window, whose look is never touched (changing it
    /// left the page deaf to the pointer's moves). The screen's top inset
    /// that a slide keeps clear of, in points; none on the way back.
    pub fn talk_window(w: &tauri::webview::PlatformWebview, on: bool) -> f64 {
        let Some(mtm) = MainThreadMarker::new() else { return 0.0 };
        let app = NSApplication::sharedApplication(mtm);
        // SAFETY: on the main thread, where with_webview calls this; the
        // window and its WKWebView are the webview's, alive while it is -
        // while a talk is given, the window is the talk's.
        let (now, page) = unsafe { (&*(w.ns_window() as *const NSWindow), &*(w.inner() as *const NSView)) };
        TALK.with(|t| {
            let mut t = t.borrow_mut();
            if on {
                if let Some(talk) = t.as_ref() {
                    return talk.window.screen().map_or(0.0, |s| s.safeAreaInsets().top);
                }
                let main = now.retain();
                let (Some(screen), Some(content)) = (main.screen(), main.contentView()) else { return 0.0 };
                // SAFETY: the designated initialiser, with arguments of the types it takes.
                let window: Retained<TalkWindow> = unsafe {
                    msg_send![TalkWindow::alloc(mtm), initWithContentRect: screen.frame(), styleMask: NSWindowStyleMask::Borderless, backing: NSBackingStoreType::Buffered, defer: false]
                };
                unsafe { window.setReleasedWhenClosed(false) };
                window.setBackgroundColor(Some(&NSColor::blackColor()));
                main.setContentView(Some(&NSView::new(mtm)));
                window.setContentView(Some(&content));
                let options = app.presentationOptions();
                app.setPresentationOptions(Options::HideDock | Options::HideMenuBar);
                window.makeKeyAndOrderFront(None);
                window.makeFirstResponder(Some(page));
                let top = screen.safeAreaInsets().top;
                *t = Some(Talk { window, main, options });
                top
            } else if let Some(talk) = t.take() {
                let main = &talk.main;
                if let Some(content) = talk.window.contentView() {
                    talk.window.setContentView(Some(&NSView::new(mtm)));
                    main.setContentView(Some(&content));
                }
                main.makeKeyAndOrderFront(None);
                main.makeFirstResponder(Some(page));
                talk.window.orderOut(None);
                app.setPresentationOptions(talk.options);
                0.0
            } else {
                0.0
            }
        })
    }
}
