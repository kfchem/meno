//! A plugin that talks with a model: the `language-model` role
//! (docs/CONVERSATIONS.md, *Connections*). Its worker reaches the hosts its
//! installed manifest names, and those alone, through the network gate,
//! under the purpose `model:<id>`. The person's key for its service is kept
//! in the system's keychain and read here, never handed to the page: it is
//! added to a `converse` request on its way to the worker (`ext_converse`),
//! the one way such a request reaches it, and taken out again of whatever
//! the worker says before the page or Meno's log sees it.

use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde_json::Value;

use crate::net::TaskHandle;

/// The role a model's plugin fills (lib/plugins/roles.ts).
pub const ROLE: &str = "language-model";

/// The most hosts the role names (lib/plugins/manifest.ts `HOSTS_MOST`).
const HOSTS_MOST: usize = 8;

/// Where a system has no keychain Meno trusts: a key is not kept at all,
/// rather than kept where it could be read or would be forgotten.
#[cfg(not(any(target_os = "macos", windows)))]
pub const NO_SAFE_PLACE: &str = "No safe place to keep a key on this system";

/// The purpose a model's plugin uses the network under: allowed by the
/// person once, as any, and withdrawn in Settings, Network.
pub fn purpose(plugin: &str) -> String {
    format!("model:{plugin}")
}

/// The hosts a manifest's `language-model` role names, read as the page
/// reads them (lib/plugins/manifest.ts `hostsOf`): each a host's name
/// exactly, 1 to 8. None where it fills no such role, or names one amiss.
pub fn hosts_of(manifest: &Value) -> Option<Vec<String>> {
    let role = manifest.get("roles")?.as_array()?.iter().find(|r| r.get("role").and_then(Value::as_str) == Some(ROLE))?;
    let hosts = role.get("hosts")?.as_array()?;
    if hosts.is_empty() || hosts.len() > HOSTS_MOST {
        return None;
    }
    let mut out: Vec<String> = Vec::new();
    for h in hosts {
        let h = h.as_str().filter(|h| host_ok(h))?;
        if !out.iter().any(|o| o == h) {
            out.push(h.to_string());
        }
    }
    Some(out)
}

/// A host's name: lowercase labels of letters, digits and hyphens, at least
/// two of them - never a pattern, an address or a port.
fn host_ok(h: &str) -> bool {
    let label = |l: &str| {
        (1..=63).contains(&l.len())
            && l.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            && !l.starts_with('-')
            && !l.ends_with('-')
    };
    h.len() <= 253 && h.split('.').count() >= 2 && h.split('.').all(label) && !h.bytes().all(|b| b.is_ascii_digit() || b == b'.')
}

/// A key as a service gives one: 8 to 4096 characters, each one that JSON
/// writes as it is - letters, digits and `-._~+/=` - so that it is found
/// again, whole, wherever a worker might echo it.
pub fn key_ok(key: &str) -> bool {
    (8..=4096).contains(&key.len()) && key.bytes().all(|b| b.is_ascii_alphanumeric() || b"-._~+/=".contains(&b))
}

/// Where keys are kept: the system's keychain in Meno; one in memory in a
/// test. None of these hands a key to the page.
pub trait Keys: Send + Sync {
    fn get(&self, plugin: &str) -> Result<Option<String>, String>;
    fn set(&self, plugin: &str, key: &str) -> Result<(), String>;
    fn forget(&self, plugin: &str) -> Result<(), String>;
}

/// The account a plugin's key is kept under, in the service "Meno": one per
/// plugin, so that forgetting one forgets that one alone.
fn account(plugin: &str) -> String {
    format!("model:{plugin}")
}

/// The macOS keychain, or Windows' Credential Manager.
#[cfg(any(target_os = "macos", windows))]
pub struct SystemKeys;

#[cfg(any(target_os = "macos", windows))]
impl SystemKeys {
    fn entry(plugin: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new("Meno", &account(plugin)).map_err(|e| refused(&e))
    }
}

/// What the keychain said, in words that never carry what it holds: its
/// errors are named, never shown (one of them carries the bytes it could
/// not read).
#[cfg(any(target_os = "macos", windows))]
fn refused(e: &keyring::Error) -> String {
    let why = match e {
        keyring::Error::NoStorageAccess(_) => "it could not be opened",
        keyring::Error::PlatformFailure(_) => "it failed",
        keyring::Error::BadEncoding(_) => "what it holds is not a key",
        keyring::Error::TooLong(..) | keyring::Error::Invalid(..) => "the key is not one it keeps",
        keyring::Error::Ambiguous(_) => "it holds more than one",
        _ => "it refused",
    };
    format!("The system's keychain: {why}")
}

#[cfg(any(target_os = "macos", windows))]
impl Keys for SystemKeys {
    fn get(&self, plugin: &str) -> Result<Option<String>, String> {
        match Self::entry(plugin)?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(refused(&e)),
        }
    }

    fn set(&self, plugin: &str, key: &str) -> Result<(), String> {
        Self::entry(plugin)?.set_password(key).map_err(|e| refused(&e))
    }

    fn forget(&self, plugin: &str) -> Result<(), String> {
        match Self::entry(plugin)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(refused(&e)),
        }
    }
}

/// A system with no keychain Meno trusts: no key is kept, and none read.
#[cfg(not(any(target_os = "macos", windows)))]
pub struct SystemKeys;

#[cfg(not(any(target_os = "macos", windows)))]
impl Keys for SystemKeys {
    fn get(&self, _plugin: &str) -> Result<Option<String>, String> {
        Err(NO_SAFE_PLACE.into())
    }

    fn set(&self, _plugin: &str, _key: &str) -> Result<(), String> {
        Err(NO_SAFE_PLACE.into())
    }

    fn forget(&self, _plugin: &str) -> Result<(), String> {
        Err(NO_SAFE_PLACE.into())
    }
}

/// A model plugin's worker, as Meno started it: whose it is, the network
/// task it goes out under (none where its purpose was not allowed when it
/// started), and the key last given to it, to be taken out of what it says.
struct Worker {
    plugin: String,
    task: Option<TaskHandle>,
    given: Option<String>,
}

/// The model plugins' workers running, by their sidecars' ids, and where
/// keys are kept.
pub struct Models {
    keys: Box<dyn Keys>,
    workers: Mutex<HashMap<String, Worker>>,
}

impl Models {
    pub fn new(keys: Box<dyn Keys>) -> Self {
        Models { keys, workers: Mutex::new(HashMap::new()) }
    }

    fn workers(&self) -> MutexGuard<'_, HashMap<String, Worker>> {
        self.workers.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn keys(&self) -> &dyn Keys {
        self.keys.as_ref()
    }

    /// A model plugin's worker started, as `sidecar`.
    pub fn started(&self, sidecar: &str, plugin: &str, task: Option<TaskHandle>) {
        self.workers().insert(sidecar.into(), Worker { plugin: plugin.into(), task, given: None });
    }

    /// A worker gone: its network task ended with it.
    pub fn ended(&self, sidecar: &str) {
        if let Some(Worker { task: Some(task), .. }) = self.workers().remove(sidecar) {
            task.finish(true);
        }
    }

    /// A converse request on its way to `sidecar`, the person's key for its
    /// plugin added: the line written to it. Refused - in words that carry
    /// neither the key nor the request - where the sidecar is no model
    /// plugin's, the request is not a converse, it brings a key of its own,
    /// or no key is kept.
    pub fn converse_line(&self, sidecar: &str, request: &str) -> Result<String, String> {
        let plugin = self.workers().get(sidecar).map(|w| w.plugin.clone()).ok_or("Not a model plugin's worker")?;
        let key = self.keys.get(&plugin)?.ok_or_else(|| format!("No key is kept for {plugin}: add it in Settings, Conversations"))?;
        let line = with_key(request, &key)?;
        if let Some(w) = self.workers().get_mut(sidecar) {
            w.given = Some(key);
        }
        Ok(line + "\n")
    }

    /// Whether what the page writes to `sidecar` holds a converse request:
    /// to a model plugin's worker, only `converse_line` sends one.
    pub fn refuses(&self, sidecar: &str, data: &str) -> bool {
        self.workers().contains_key(sidecar) && data.lines().any(|l| serde_json::from_str::<Value>(l).ok().and_then(|v| v.get("op").and_then(Value::as_str).map(|op| op == "converse")).unwrap_or(false))
    }

    /// A line `sidecar` said, with the key given to it taken out, wherever
    /// it is: what the page and the log are given.
    pub fn scrub<'a>(&self, sidecar: &str, line: &'a str) -> Cow<'a, str> {
        match self.workers().get(sidecar).and_then(|w| w.given.as_deref()) {
            Some(key) if line.contains(key) => Cow::Owned(line.replace(key, "[key]")),
            _ => Cow::Borrowed(line),
        }
    }
}

/// A converse request with `key` added: one JSON object, whose `op` is
/// `converse` and which brings no key of its own, written on one line.
pub fn with_key(request: &str, key: &str) -> Result<String, String> {
    let mut v: Value = serde_json::from_str(request).map_err(|_| "A converse request that is not one".to_string())?;
    let o = v.as_object_mut().ok_or("A converse request that is not one")?;
    if o.get("op").and_then(Value::as_str) != Some("converse") {
        return Err("Only a converse request is sent this way".into());
    }
    if o.contains_key("key") {
        return Err("A converse request brings no key: Meno adds it".into());
    }
    o.insert("key".into(), Value::String(key.into()));
    Ok(v.to_string())
}

#[cfg(test)]
pub struct MemoryKeys(pub Mutex<HashMap<String, String>>);

#[cfg(test)]
impl Keys for MemoryKeys {
    fn get(&self, plugin: &str) -> Result<Option<String>, String> {
        Ok(self.0.lock().unwrap().get(&account(plugin)).cloned())
    }

    fn set(&self, plugin: &str, key: &str) -> Result<(), String> {
        self.0.lock().unwrap().insert(account(plugin), key.into());
        Ok(())
    }

    fn forget(&self, plugin: &str) -> Result<(), String> {
        self.0.lock().unwrap().remove(&account(plugin));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const KEY: &str = "sk-test-0123456789abcdef";

    fn models() -> Models {
        let keys = MemoryKeys(Mutex::new(HashMap::new()));
        keys.set("talker", KEY).unwrap();
        let m = Models::new(Box::new(keys));
        m.started("w1", "talker", None);
        m
    }

    #[test]
    fn the_key_is_added_on_the_way_to_the_worker_and_taken_out_of_what_it_says() {
        let m = models();
        let line = m.converse_line("w1", r#"{"id":3,"op":"converse","told":"t","said":[],"tools":[],"options":{}}"#).unwrap();
        assert!(line.ends_with('\n') && line.matches('\n').count() == 1);
        let sent: Value = serde_json::from_str(line.trim_end()).unwrap();
        assert_eq!(sent["key"], json!(KEY));
        assert_eq!(sent["id"], json!(3));
        // (a worker that echoes it: the page and the log see "[key]")
        let echoed = format!(r#"{{"id":3,"ok":false,"error":"refused {KEY} twice {KEY}"}}"#);
        let scrubbed = m.scrub("w1", &echoed);
        assert!(!scrubbed.contains(KEY));
        assert_eq!(scrubbed.matches("[key]").count(), 2);
        // (another worker's lines are its own)
        assert_eq!(m.scrub("w2", &echoed), echoed.as_str());
    }

    #[test]
    fn the_page_sets_no_key_and_sends_converse_no_other_way() {
        let m = models();
        for bad in [r#"{"op":"converse","key":"mine-0123456789"}"#, r#"{"op":"read"}"#, r#"[1]"#, "not json", r#"{"op":"converse"#] {
            let e = m.converse_line("w1", bad).unwrap_err();
            assert!(!e.contains(KEY) && !e.contains("mine-0123456789"), "{e}");
        }
        // (through the stdin the page writes to: refused for a model plugin's worker, as is any line of it)
        assert!(m.refuses("w1", "{\"op\":\"converse\",\"told\":\"t\"}\n"));
        assert!(m.refuses("w1", "{\"id\":1,\"op\":\"ping\"}\n{\"op\":\"converse\"}\n"));
        assert!(!m.refuses("w1", "{\"id\":1,\"op\":\"ping\"}\n"));
        // (another plugin's worker is as it was)
        assert!(!m.refuses("w2", "{\"op\":\"converse\"}\n"));
        assert_eq!(m.converse_line("w2", r#"{"op":"converse"}"#).unwrap_err(), "Not a model plugin's worker");
    }

    #[test]
    fn with_no_key_kept_it_says_where_to_add_one() {
        let m = Models::new(Box::new(MemoryKeys(Mutex::new(HashMap::new()))));
        m.started("w1", "talker", None);
        assert_eq!(m.converse_line("w1", r#"{"op":"converse"}"#).unwrap_err(), "No key is kept for talker: add it in Settings, Conversations");
    }

    #[test]
    fn each_plugin_has_its_own_key_and_forgetting_one_forgets_it_alone() {
        let keys = MemoryKeys(Mutex::new(HashMap::new()));
        keys.set("talker", KEY).unwrap();
        keys.set("other", "other-0123456789").unwrap();
        keys.forget("talker").unwrap();
        assert_eq!(keys.get("talker").unwrap(), None);
        assert_eq!(keys.get("other").unwrap().as_deref(), Some("other-0123456789"));
    }

    #[test]
    fn a_worker_gone_is_forgotten_with_its_key() {
        let m = models();
        m.converse_line("w1", r#"{"op":"converse"}"#).unwrap();
        m.ended("w1");
        assert!(!m.refuses("w1", "{\"op\":\"converse\"}\n"));
        assert!(m.converse_line("w1", r#"{"op":"converse"}"#).is_err());
    }

    #[test]
    fn a_key_is_one_a_service_gives() {
        assert!(key_ok(KEY));
        assert!(key_ok("abcd/EFG+h=_~.-"));
        for bad in ["short", "with space 0123", "quote\"0123456", "back\\slash0123", "new\nline0123", &"x".repeat(4097), "ünicode-0123456"] {
            assert!(!key_ok(bad), "{bad:?}");
        }
    }

    #[test]
    fn the_hosts_are_the_manifests_own_read_as_the_page_reads_them() {
        let m = |hosts: Value| json!({"roles": [{"role": "smiles"}, {"role": ROLE, "hosts": hosts}]});
        assert_eq!(hosts_of(&m(json!(["api.example.com", "api.example.com", "files.example.com"]))), Some(vec!["api.example.com".to_string(), "files.example.com".to_string()]));
        for bad in [json!([]), json!(["*.example.com"]), json!([".example.com"]), json!(["API.example.com"]), json!(["api.example.com:443"]), json!(["127.0.0.1"]), json!(["localhost"]), json!(["a.example.com", 3]), json!((0..9).map(|i| format!("h{i}.example.com")).collect::<Vec<_>>()), json!("api.example.com")] {
            assert_eq!(hosts_of(&m(bad.clone())), None, "{bad}");
        }
        assert_eq!(hosts_of(&json!({"roles": [{"role": "smiles", "hosts": ["api.example.com"]}]})), None);
        assert_eq!(hosts_of(&json!({})), None);
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    #[test]
    fn where_no_keychain_is_trusted_no_key_is_kept() {
        assert_eq!(SystemKeys.set("talker", KEY).unwrap_err(), NO_SAFE_PLACE);
        assert_eq!(SystemKeys.get("talker").unwrap_err(), NO_SAFE_PLACE);
    }
}
