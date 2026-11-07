//! The computer kept from sleeping while a job's program runs (Settings,
//! *Calculations*: on unless turned off; jobs.rs `Limits::awake`): a long
//! calculation left running overnight is not cut short by the computer going
//! to sleep when no one is at it. Held by the job's runner from when its
//! program starts until it and the programs after it have ended - the
//! runner's own, so that it holds whether Meno is open or not - and let go
//! with it, however the runner ends. Only sleep for want of use is held off:
//! the display may still dim and turn off, and a lid closed or a sleep asked
//! for is the person's to make.
//!
//! - macOS: the system's own `caffeinate`, keeping it from sleeping for want
//!   of use (`-i`) for as long as the runner is there (`-w`, its process);
//! - Windows: the runner's thread saying the system is needed
//!   (`SetThreadExecutionState`), until it says so no more or ends;
//! - elsewhere: nothing held.

/// The computer kept awake for as long as this is held.
pub struct Awake {
    #[cfg(target_os = "macos")]
    child: Option<std::process::Child>,
    #[cfg(windows)]
    held: bool,
}

/// The computer kept awake from now until what this gives is let go - or the
/// runner ends. Where it cannot be held, nothing is, and the job runs all the
/// same.
pub fn hold() -> Awake {
    #[cfg(target_os = "macos")]
    {
        use std::process::{Command, Stdio};
        let child = Command::new("/usr/bin/caffeinate")
            .args(["-i", "-w", &std::process::id().to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok();
        Awake { child }
    }
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED};
        // SAFETY: a call with flags alone, for this thread; its answer - nought where it failed - is all it gives.
        let held = unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) } != 0;
        Awake { held }
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        Awake {}
    }
}

impl Awake {
    /// Whether the computer is being kept awake by this.
    #[allow(dead_code)]
    pub fn holding(&self) -> bool {
        #[cfg(target_os = "macos")]
        return self.child.is_some();
        #[cfg(windows)]
        return self.held;
        #[cfg(not(any(target_os = "macos", windows)))]
        return false;
    }
}

impl Drop for Awake {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        #[cfg(windows)]
        if self.held {
            use windows_sys::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS};
            // SAFETY: as in `hold`: this thread no longer saying the system is needed.
            unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[test]
    fn caffeinate_runs_while_held_for_this_process_and_goes_when_let_go() {
        let awake = hold();
        assert!(awake.holding());
        let pid = awake.child.as_ref().unwrap().id();
        let alive = |pid: u32| std::process::Command::new("/bin/kill").args(["-0", &pid.to_string()]).status().is_ok_and(|s| s.success());
        assert!(alive(pid));
        // (and it waits on this very process: it goes with the runner, however the runner ends)
        let said = std::process::Command::new("/bin/ps").args(["-o", "command=", "-p", &pid.to_string()]).output().unwrap();
        assert!(String::from_utf8_lossy(&said.stdout).contains(&format!("-w {}", std::process::id())));
        drop(awake);
        assert!(!alive(pid));
    }

    #[test]
    fn holding_or_not_it_lets_go_without_fault() {
        let awake = hold();
        let _ = awake.holding();
        drop(awake);
    }
}
