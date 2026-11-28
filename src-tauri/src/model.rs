//! A plugin that talks with a model: the `language-model` role
//! (docs/CONVERSATIONS.md, *Connections*). Its worker reaches the hosts its
//! installed manifest names, and those alone, through the network gate,
//! under the purpose `model:<id>@<hosts>`. A plugin that looks names up -
//! the `names` role (docs/PLUGINS.md, *Roles*) - goes out the same way, under
//! `lookup:<id>@<hosts>`, and is given no key. The person's key for its service is kept
//! in the system's keychain and read here, never handed to the page: it is
//! added to a `converse` request on its way to the worker (`ext_converse`),
//! the one way such a request reaches it, and taken out again of whatever
//! the worker says before the page or Meno's log sees it.

use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde_json::Value;

use crate::net::TaskHandle;

/// The role a model's plugin fills (lib/plugins/roles.ts).
pub const ROLE: &str = "language-model";

/// The role a plugin that finds a structure by its name fills (lib/plugins/roles.ts).
pub const NAMES_ROLE: &str = "names";

/// What a plugin's worker goes out for: the one role naming hosts it fills
/// (a plugin fills at most one: lib/plugins/manifest.ts `acceptManifest`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Hosted {
    /// Talking with a model: its key added to each converse request.
    Model,
    /// Looking names up: no key, and no converse request.
    Names,
}

impl Hosted {
    /// The role it is, as a manifest names it.
    fn role(self) -> &'static str {
        match self {
            Hosted::Model => ROLE,
            Hosted::Names => NAMES_ROLE,
        }
    }

    /// The purpose its worker goes out under: allowed by the person once, as
    /// any, and withdrawn in Settings, Network. The hosts are in it, in order:
    /// a yes is for those hosts, and a plugin in place that names others -
    /// updated - is asked of again (lib's `modelPurpose` and `lookupPurpose`,
    /// the same).
    pub fn purpose(self, plugin: &str, hosts: &[String]) -> String {
        let mut hosts = hosts.to_vec();
        hosts.sort();
        let kind = match self {
            Hosted::Model => "model",
            Hosted::Names => "lookup",
        };
        format!("{kind}:{plugin}@{}", hosts.join(","))
    }

    /// Its network task, in words.
    pub fn label(self, plugin: &str) -> String {
        match self {
            Hosted::Model => format!("{plugin}: talking with a model"),
            Hosted::Names => format!("{plugin}: looking names up"),
        }
    }
}

/// The most hosts the role names (lib/plugins/manifest.ts `HOSTS_MOST`).
const HOSTS_MOST: usize = 8;

/// Where a system has no keychain Meno trusts: a key is not kept at all,
/// rather than kept where it could be read or would be forgotten.
#[cfg(not(any(target_os = "macos", windows)))]
pub const NO_SAFE_PLACE: &str = "No safe place to keep a key on this system";

/// The one role naming hosts a manifest fills - talking with a model, or
/// looking names up - and the hosts it names, read as the page reads them
/// (lib/plugins/manifest.ts `hostsOf`): each a host's name exactly, 1 to 8.
/// None where it fills no such role, names one amiss, fills both, or does
/// anything else - another role, a step, a file to read or write: one worker
/// serves all of a plugin's roles, so the one that goes out is handed nothing
/// else. The page takes such a plugin for none, and its worker is given no
/// way out.
pub fn hosted_of(manifest: &Value) -> Option<(Hosted, Vec<String>)> {
    let roles = manifest.get("roles")?.as_array()?;
    let fills = |k: Hosted| roles.iter().find(|r| r.get("role").and_then(Value::as_str) == Some(k.role()));
    let (kind, role) = match (fills(Hosted::Model), fills(Hosted::Names)) {
        (Some(r), None) => (Hosted::Model, r),
        (None, Some(r)) => (Hosted::Names, r),
        _ => return None,
    };
    let more = |k: &str| manifest.get(k).is_some_and(|v| v.as_array().is_none_or(|a| !a.is_empty()));
    if roles.len() != 1 || ["steps", "reads", "writes"].into_iter().any(more) {
        return None;
    }
    Some((kind, hosts_in(role)?))
}

/// Whether a network task's purpose is a plugin's role that goes out
/// (`Hosted::purpose`): the gate then reaches only addresses on the web.
pub fn goes_out_for_a_role(purpose: &str) -> bool {
    purpose.starts_with("model:") || purpose.starts_with("lookup:")
}

/// The hosts a role names, each a host's name exactly, 1 to 8, each once.
fn hosts_in(role: &Value) -> Option<Vec<String>> {
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

/// A public host's name: lowercase labels of letters, digits and hyphens, at
/// least two of them, the last of letters alone (so never a number, as
/// `0x7f.1` or `10.1` would be read), none of them `localhost` - never a
/// pattern, an address in any spelling, or a port.
fn host_ok(h: &str) -> bool {
    let label = |l: &str| {
        (1..=63).contains(&l.len())
            && l.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            && !l.starts_with('-')
            && !l.ends_with('-')
            && l != "localhost"
    };
    let last = h.rsplit('.').next().unwrap_or("");
    h.len() <= 253 && h.split('.').count() >= 2 && h.split('.').all(label) && !last.is_empty() && last.bytes().all(|b| b.is_ascii_lowercase())
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
/// started, or once it has ended) - under way only while something asked of
/// it is unanswered (`asked`), at rest between - every key given to it, to be taken out of
/// what it says, and how many of its streams - its output and its errors -
/// are still read. It is forgotten, keys and all, only once the last of
/// them is read to its end: what it said till then is all taken out.
struct Worker {
    plugin: String,
    kind: Hosted,
    task: Option<TaskHandle>,
    given: Vec<String>,
    reading: u8,
    ended: bool,
    /// The ids of the requests written to it that it has yet to answer.
    asked: HashSet<i64>,
    /// The end of each request's words sent as they come that may begin a key, held back from the page till the next
    /// part shows whether it does (`scrub`): by the request's id.
    held: HashMap<i64, String>,
}

/// A request's id, where `line` is one: a JSON object with a number for
/// its id and a name for what it asks (`op`), as the page writes one.
fn request_id(line: &str) -> Option<i64> {
    let v: Value = serde_json::from_str(line).ok()?;
    v.get("op")?.as_str()?;
    v.get("id")?.as_i64()
}

/// A worker's task at rest, where nothing asked of it waits for an answer.
fn rest_if_idle(w: &Worker) {
    if w.asked.is_empty() {
        if let Some(task) = &w.task {
            task.rest();
        }
    }
}

/// The streams of a worker read: its output and its errors.
const STREAMS: u8 = 2;

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

    /// A worker of a plugin that names hosts started, as `sidecar`, before
    /// its streams are read: a model's, or one that looks names up - which
    /// is given no key, nor any converse request.
    pub fn started(&self, sidecar: &str, plugin: &str, kind: Hosted, task: Option<TaskHandle>) {
        self.workers().insert(sidecar.into(), Worker { plugin: plugin.into(), kind, task, given: Vec::new(), reading: STREAMS, ended: false, asked: HashSet::new(), held: HashMap::new() });
    }

    /// Requests on their way to `sidecar` (`data`, as it is written to it,
    /// line by line): its network task under way from the first of them
    /// till the last is answered (`heard`) - as the window sees it, a task
    /// of its own each time it is asked, never one for as long as it runs.
    pub fn asking(&self, sidecar: &str, data: &str) {
        let mut workers = self.workers();
        let Some(w) = workers.get_mut(sidecar).filter(|w| !w.ended) else { return };
        let idle = w.asked.is_empty();
        w.asked.extend(data.lines().filter_map(request_id));
        if idle && !w.asked.is_empty() {
            if let Some(task) = &w.task {
                task.resume();
            }
        }
    }

    /// Requests that never reached `sidecar` - their writing failed: no
    /// answer is waited for.
    pub fn not_asked(&self, sidecar: &str, data: &str) {
        let mut workers = self.workers();
        let Some(w) = workers.get_mut(sidecar) else { return };
        for id in data.lines().filter_map(request_id) {
            w.asked.remove(&id);
        }
        rest_if_idle(w);
    }

    /// A line `sidecar` said on its output: where it answers a request -
    /// as the page takes an answer (lib/roles/client `receive`): any line
    /// with the request's id, but a part of the words said as they come -
    /// that one is no longer waited for; the last of them answered, and
    /// its network task is at rest, its notice going as a finished one's.
    pub fn heard(&self, sidecar: &str, line: &str) {
        let Ok(Value::Object(o)) = serde_json::from_str::<Value>(line) else { return };
        let Some(id) = o.get("id").and_then(Value::as_i64) else { return };
        if o.contains_key("partial") && !o.contains_key("ok") {
            return;
        }
        let mut workers = self.workers();
        let Some(w) = workers.get_mut(sidecar) else { return };
        if w.asked.remove(&id) {
            rest_if_idle(w);
        }
    }

    /// A worker gone, or stopped: its network task ended with it, and nothing
    /// more sent it. What it still says is read, its keys taken out
    /// (`read_to_end`).
    pub fn ended(&self, sidecar: &str) {
        // (gone with something asked of it unanswered: its spell failed; at rest, its way out goes and nothing more is told)
        let task = self.workers().get_mut(sidecar).and_then(|w| {
            w.ended = true;
            let answered = w.asked.is_empty();
            w.asked.clear();
            w.task.take().map(|t| (t, answered))
        });
        if let Some((task, answered)) = task {
            task.finish(answered);
        }
    }

    /// One of a worker's streams read to its end; the last of them, and the
    /// worker is forgotten with its keys - ended, should it not be already.
    pub fn read_to_end(&self, sidecar: &str) {
        let last = match self.workers().get_mut(sidecar) {
            Some(w) => {
                w.reading = w.reading.saturating_sub(1);
                w.reading == 0
            }
            None => false,
        };
        if last {
            self.ended(sidecar);
            self.workers().remove(sidecar);
        }
    }

    /// A converse request on its way to `sidecar`, the person's key for its
    /// plugin added: the line written to it. Refused - in words that carry
    /// neither the key nor the request - where the sidecar is no model
    /// plugin's, the request is not a converse, it brings a key of its own,
    /// or no key is kept.
    pub fn converse_line(&self, sidecar: &str, request: &str) -> Result<String, String> {
        let plugin = self.workers().get(sidecar).filter(|w| !w.ended && w.kind == Hosted::Model).map(|w| w.plugin.clone()).ok_or("Not a model plugin's worker")?;
        let key = self.keys.get(&plugin)?.ok_or_else(|| format!("No key is kept for {plugin}: add it in Settings, Conversations"))?;
        let line = with_key(request, &key)?;
        // (each key given kept, an earlier one too - Settings may give it another while a request is under way)
        match self.workers().get_mut(sidecar) {
            Some(w) if !w.given.contains(&key) => w.given.push(key),
            Some(_) => {}
            None => return Err("Not a model plugin's worker".into()),
        }
        Ok(line + "\n")
    }

    /// Whether what the page writes to `sidecar` is refused: to a worker of
    /// a plugin that names hosts - a model's, or one that looks names up -
    /// only whole lines, each a JSON object - read as the
    /// worker reads it, line by line - that is no converse request; only
    /// `converse_line` sends one. A line split over two writes, or one that
    /// is not read here as it would be there, never reaches it. (Each part of
    /// a split converse also fails as a JSON object on its own: the whole-line
    /// rule is the second check, so that no part is ever judged as a line.)
    pub fn refuses(&self, sidecar: &str, data: &str) -> bool {
        let line_ok = |l: &str| {
            l.trim().is_empty()
                || serde_json::from_str::<Value>(l).ok().is_some_and(|v| v.is_object() && v.get("op").and_then(Value::as_str) != Some("converse"))
        };
        self.workers().contains_key(sidecar) && (!data.ends_with('\n') || !data.lines().all(line_ok))
    }

    /// A line `sidecar` said, with every key given to it taken out, wherever
    /// it is: what the page and the log are given. A part of a reply's words
    /// sent as they come (`{id, partial}`) is taken out of across the parts:
    /// the end of one that may begin a key is held back and said with the
    /// next part of the same request, so that a key said in two parts is
    /// taken out whole (`partial_scrubbed`); the answer, which holds the
    /// words whole, lets go of what was held.
    pub fn scrub<'a>(&self, sidecar: &str, line: &'a str) -> Cow<'a, str> {
        let mut workers = self.workers();
        let Some(w) = workers.get_mut(sidecar) else { return Cow::Borrowed(line) };
        if let Some(part) = partial_scrubbed(w, line) {
            return Cow::Owned(part);
        }
        let mut out = Cow::Borrowed(line);
        for key in &w.given {
            if out.contains(key.as_str()) {
                out = Cow::Owned(out.replace(key.as_str(), "[key]"));
            }
        }
        out
    }
}

/// A part of a reply's words, `{id, partial}`, as the page is given it: what
/// was held back of the parts before it, then its words, each key given to
/// the worker taken out - but for its end, where that may begin a key, held
/// back for the next part. None where the line is no such part; an answer to
/// a request lets go of what was held back of its parts.
fn partial_scrubbed(w: &mut Worker, line: &str) -> Option<String> {
    if w.given.is_empty() {
        return None;
    }
    let v: Value = serde_json::from_str(line).ok()?;
    let o = v.as_object()?;
    let id = o.get("id")?.as_i64()?;
    if o.contains_key("ok") {
        w.held.remove(&id);
        return None;
    }
    let part = o.get("partial")?.as_str()?;
    let mut text = w.held.remove(&id).unwrap_or_default() + part;
    for key in &w.given {
        text = text.replace(key.as_str(), "[key]");
    }
    // (the longest end of it that is the start of a key: held back)
    let held = w.given.iter().map(|key| begins(&text, key)).max().unwrap_or(0);
    let (now, later) = text.split_at(text.len() - held);
    if !later.is_empty() {
        w.held.insert(id, later.to_string());
    }
    Some(serde_json::json!({ "id": id, "partial": now }).to_string())
}

/// How long the end of `text` is that is the start of `key`, short of the whole of it: 0 where none is.
fn begins(text: &str, key: &str) -> usize {
    (1..key.len()).rev().find(|&n| n <= text.len() && text.is_char_boundary(text.len() - n) && key.starts_with(&text[text.len() - n..])).unwrap_or(0)
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
        m.started("w1", "talker", Hosted::Model, None);
        m
    }

    #[test]
    fn a_key_said_across_two_parts_of_a_reply_is_taken_out_whole() {
        let m = models();
        m.converse_line("w1", r#"{"id":4,"op":"converse","told":"t","said":[],"tools":[],"options":{}}"#).unwrap();
        let part = |text: &str| m.scrub("w1", &json!({"id": 4, "partial": text}).to_string()).into_owned();
        let said = |line: String| serde_json::from_str::<Value>(&line).unwrap()["partial"].as_str().unwrap().to_string();
        // (its first half held back, then said with the rest - taken out whole)
        let (a, b) = KEY.split_at(9);
        assert_eq!(said(part(&format!("Your key is {a}"))), "Your key is ");
        assert_eq!(said(part(&format!("{b}, it seems."))), "[key], it seems.");
        // (an end that only looked like a key's start: said with the next part, nothing lost)
        assert_eq!(said(part("Methanol, s")), "Methanol, ");
        assert_eq!(said(part("o it is.")), "so it is.");
        // (a part with nothing held, and nothing like a key: as it was)
        assert_eq!(said(part("Done.")), "Done.");
        // (the answer lets go of what was held of its parts; another request's parts are their own)
        part("sk-");
        assert!(m.scrub("w1", r#"{"id":4,"ok":true,"result":{"text":"x"}}"#).contains("\"ok\""));
        assert_eq!(said(m.scrub("w1", &json!({"id": 5, "partial": "test"}).to_string()).into_owned()), "test");
        assert_eq!(said(part("one more")), "one more");
    }

    #[test]
    fn parts_of_a_reply_reach_the_page_in_order_and_an_error_lets_go_of_what_was_held() {
        let m = models();
        m.converse_line("w1", r#"{"id":8,"op":"converse","told":"t","said":[],"tools":[],"options":{},"stream":true}"#).unwrap();
        let part = |text: &str| m.scrub("w1", &json!({"id": 8, "partial": text}).to_string()).into_owned();
        let said = |line: String| serde_json::from_str::<Value>(&line).unwrap()["partial"].as_str().unwrap().to_string();
        // (words with nothing like a key in them: each part as it was sent, in order)
        let told: Vec<String> = ["Glycine ", "is ", "here."].iter().map(|p| said(part(p))).collect();
        assert_eq!(told, ["Glycine ", "is ", "here."]);
        // (an error as the words come: given as it is, and what was held of its parts let go - the next request's parts its own)
        part("sk-");
        let error = r#"{"id":8,"ok":false,"error":"the line to Plumtree went quiet"}"#;
        assert_eq!(m.scrub("w1", error), error);
        assert_eq!(said(m.scrub("w1", &json!({"id": 9, "partial": "Alanine"}).to_string()).into_owned()), "Alanine");
        assert_eq!(said(part("again")), "again");
    }

    #[test]
    fn a_worker_given_no_key_says_its_lines_as_they_are() {
        // (one of the names role's, given no key: a part of an answer, or an answer, passed on untouched)
        let m = models();
        m.started("w2", "finder", Hosted::Names, None);
        let line = r#"{"id":1,"partial":"sk-"}"#;
        assert_eq!(m.scrub("w2", line), line);
        let line = r#"{"id":1,"ok":true,"result":{"none":true}}"#;
        assert_eq!(m.scrub("w2", line), line);
    }

    #[test]
    fn a_key_said_across_parts_is_taken_out_wherever_it_is_split() {
        let m = models();
        m.converse_line("w1", r#"{"id":6,"op":"converse","told":"t","said":[],"tools":[],"options":{}}"#).unwrap();
        let part = |text: &str| m.scrub("w1", &json!({"id": 6, "partial": text}).to_string()).into_owned();
        let said = |line: String| serde_json::from_str::<Value>(&line).unwrap()["partial"].as_str().unwrap().to_string();
        // (split before its last character: all of it but one held back)
        let (a, b) = KEY.split_at(KEY.len() - 1);
        assert_eq!(said(part(&format!("It is {a}"))), "It is ");
        assert_eq!(said(part(&format!("{b}."))), "[key].");
        // (split after its first character)
        let (a, b) = KEY.split_at(1);
        assert_eq!(said(part(&format!("It is {a}"))), "It is ");
        assert_eq!(said(part(&format!("{b}."))), "[key].");
        // (said a character at a time: no part holds it, and the page is given it taken out whole at the end)
        let mut told = String::new();
        for c in KEY.chars() {
            told += &said(part(&c.to_string()));
        }
        told += &said(part("!"));
        assert_eq!(told, "[key]!");
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
        m.started("w1", "talker", Hosted::Model, None);
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
    fn a_worker_ended_has_its_keys_taken_out_till_both_its_streams_are_read_and_is_then_forgotten() {
        let m = models();
        m.converse_line("w1", r#"{"op":"converse"}"#).unwrap();
        // (ended - its output at an end, or stopped: nothing more sent it, but what it still says has its key taken out)
        m.ended("w1");
        assert!(m.converse_line("w1", r#"{"op":"converse"}"#).is_err());
        assert_eq!(m.scrub("w1", &format!("late {KEY}")), "late [key]");
        // (one stream read to its end: the other still has its key taken out)
        m.read_to_end("w1");
        assert_eq!(m.scrub("w1", &format!("later {KEY}")), "later [key]");
        assert!(m.refuses("w1", "{\"op\":\"converse\"}\n"));
        // (both read: forgotten, keys and all)
        m.read_to_end("w1");
        assert!(!m.refuses("w1", "{\"op\":\"converse\"}\n"));
        assert!(m.converse_line("w1", r#"{"op":"converse"}"#).is_err());
        // (its streams read to their ends before it was stopped: ended with the last of them)
        let m = models();
        m.converse_line("w1", r#"{"op":"converse"}"#).unwrap();
        m.read_to_end("w1");
        assert_eq!(m.scrub("w1", KEY), "[key]");
        m.read_to_end("w1");
        assert_eq!(m.scrub("w1", KEY), KEY);
    }

    /// The tasks the window was told of, by id, each as last told: whether it has ended, and how.
    fn tasks_told(told: &std::sync::Mutex<Vec<(String, Value)>>) -> Vec<(String, Option<String>)> {
        let mut out: Vec<(String, Option<String>)> = Vec::new();
        for (_, t) in told.lock().unwrap().iter().filter(|(e, _)| e == "net:task") {
            let id = t["id"].as_str().unwrap().to_string();
            let outcome = t["outcome"].as_str().map(str::to_string);
            match out.iter_mut().find(|(i, _)| *i == id) {
                Some(o) => o.1 = outcome,
                None => out.push((id, outcome)),
            }
        }
        out
    }

    #[test]
    fn a_names_workers_task_is_under_way_only_while_a_request_waits_and_its_notice_ends_with_the_answer() {
        let net = crate::net::Net::default();
        let told = net.told();
        let hosts = vec!["names.example.org".to_string()];
        net.allow(&Hosted::Names.purpose("finder", &hosts));
        let task = net.begin_resting(&Hosted::Names.purpose("finder", &hosts), &Hosted::Names.label("finder"), Some(hosts.clone())).unwrap();
        let m = Models::new(Box::new(MemoryKeys(Mutex::new(HashMap::new()))));
        m.started("w1", "finder", Hosted::Names, Some(task));
        // (started, asked nothing: nothing under way, nothing told - its way out stands)
        assert_eq!((net.running(), tasks_told(&told).len(), net.tasks_resting().len()), (0, 0, 1));
        // (asked: under way, told as begun; what it says that is no answer - its words as they come, a line of its library's - ends nothing)
        m.asking("w1", "{\"id\":1,\"op\":\"find_name\",\"name\":\"aspirin\"}\n");
        m.heard("w1", r#"{"id":1,"partial":"so far"}"#);
        m.heard("w1", "loading tables");
        m.heard("w1", r#"{"id":9,"ok":true}"#);
        assert_eq!(net.running(), 1);
        assert_eq!(tasks_told(&told), vec![(tasks_told(&told)[0].0.clone(), None)]);
        // (answered: done, as a finished task is - its notice goes as theirs do - while the worker runs on)
        m.heard("w1", r#"{"id":1,"ok":true,"result":[]}"#);
        assert_eq!(net.running(), 0);
        let first = tasks_told(&told);
        assert_eq!((first.len(), first[0].1.as_deref()), (1, Some("done")));
        // (asked again: a spell of its own, under way till its answer; two at once, till the last of them)
        m.asking("w1", "{\"id\":2,\"op\":\"find_name\",\"name\":\"a\"}\n{\"id\":3,\"op\":\"find_name\",\"name\":\"b\"}\n");
        m.heard("w1", r#"{"id":2,"ok":false,"error":"none found"}"#);
        assert_eq!(net.running(), 1, "a request still waits: its task still under way");
        m.heard("w1", r#"{"id":3,"ok":true,"result":[]}"#);
        let both = tasks_told(&told);
        assert_eq!(both.len(), 2);
        assert!(both[0].0 != both[1].0 && both.iter().all(|(_, o)| o.as_deref() == Some("done")), "{both:?}");
        // (a request whose writing failed waits for nothing)
        m.asking("w1", "{\"id\":4,\"op\":\"find_name\",\"name\":\"c\"}\n");
        m.not_asked("w1", "{\"id\":4,\"op\":\"find_name\",\"name\":\"c\"}\n");
        assert_eq!(net.running(), 0);
        // (gone with a request unanswered: that spell failed, and its way out goes with it)
        m.asking("w1", "{\"id\":5,\"op\":\"find_name\",\"name\":\"d\"}\n");
        m.ended("w1");
        let last = tasks_told(&told);
        assert_eq!((last.len(), last[3].1.as_deref()), (4, Some("failed")));
        assert_eq!((net.running(), net.tasks_resting().len()), (0, 0));
        // (ended, asked nothing more: no task begun again)
        m.asking("w1", "{\"id\":6,\"op\":\"find_name\",\"name\":\"e\"}\n");
        assert_eq!((net.running(), tasks_told(&told).len()), (0, 4));
    }

    #[test]
    fn a_worker_ended_ends_its_network_task_and_is_given_no_other() {
        let net = crate::net::Net::default();
        net.allow(&Hosted::Model.purpose("talker", &["api.example.com".to_string()]));
        let task = net.begin(&Hosted::Model.purpose("talker", &["api.example.com".to_string()]), "talker: talking with a model", Some(vec!["api.example.com".into()])).unwrap();
        let m = models();
        m.started("w1", "talker", Hosted::Model, Some(task));
        assert_eq!(net.running(), 1);
        m.ended("w1");
        assert_eq!(net.running(), 0);
        // (ended again, or read to its end: nothing more to finish)
        m.ended("w1");
        m.read_to_end("w1");
        m.read_to_end("w1");
        assert_eq!(net.running(), 0);
    }

    #[test]
    fn every_key_given_is_taken_out_an_earlier_one_too() {
        let keys = MemoryKeys(Mutex::new(HashMap::new()));
        keys.set("talker", KEY).unwrap();
        let m = Models::new(Box::new(keys));
        m.started("w1", "talker", Hosted::Model, None);
        m.converse_line("w1", r#"{"op":"converse"}"#).unwrap();
        // (a new key set in Settings while the first request is under way: both taken out of what it says)
        m.keys().set("talker", "sk-test-new-0123456789").unwrap();
        m.converse_line("w1", r#"{"op":"converse"}"#).unwrap();
        assert_eq!(m.scrub("w1", &format!("{KEY} then sk-test-new-0123456789")), "[key] then [key]");
    }

    #[test]
    fn the_page_writes_a_model_plugins_worker_whole_lines_alone_each_one_read_as_the_worker_reads_it() {
        let m = models();
        // (a converse split over two writes: refused, each part)
        assert!(m.refuses("w1", "{\"op\":\"converse\""));
        assert!(m.refuses("w1", ",\"told\":\"t\"}\n"));
        // (a line read otherwise there than here - Python's NaN - or not an object, or no JSON: refused)
        assert!(m.refuses("w1", "{\"op\":\"converse\",\"x\":NaN}\n"));
        assert!(m.refuses("w1", "[\"converse\"]\n"));
        assert!(m.refuses("w1", "not json\n"));
        // (whole lines of other requests, and blank ones: written)
        assert!(!m.refuses("w1", "{\"id\":1,\"op\":\"ping\"}\n"));
        assert!(!m.refuses("w1", "{\"id\":1,\"op\":\"ping\"}\r\n\n{\"id\":2,\"op\":\"stop\"}\n"));
        // (another plugin's worker is as it was)
        assert!(!m.refuses("w2", "{\"op\":\"converse\""));
    }

    #[test]
    fn a_yes_is_for_the_hosts_it_was_given_for() {
        let h = |hs: &[&str]| hs.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(Hosted::Model.purpose("talker", &h(&["b.example.com", "a.example.com"])), "model:talker@a.example.com,b.example.com");
        assert_eq!(Hosted::Model.purpose("talker", &h(&["a.example.com", "b.example.com"])), Hosted::Model.purpose("talker", &h(&["b.example.com", "a.example.com"])));
        // (a plugin updated to name another host: another purpose, asked of again)
        assert_ne!(Hosted::Model.purpose("talker", &h(&["api.example.com"])), Hosted::Model.purpose("talker", &h(&["api.example.com", "other.example.net"])));
    }

    #[test]
    fn a_names_plugin_goes_out_under_its_own_purpose() {
        let h = |hs: &[&str]| hs.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(Hosted::Names.purpose("finder", &h(&["b.example.org", "a.example.org"])), "lookup:finder@a.example.org,b.example.org");
                assert_ne!(Hosted::Names.purpose("finder", &h(&["a.example.org"])), Hosted::Model.purpose("finder", &h(&["a.example.org"])));
        assert_eq!(Hosted::Names.label("finder"), "finder: looking names up");
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
        let hosts = |m: &Value| hosted_of(m).map(|(_, h)| h);
        let m = |hosts: Value| json!({"roles": [{"role": ROLE, "hosts": hosts}]});
        assert_eq!(hosts(&m(json!(["api.example.com", "api.example.com", "files.example.com"]))), Some(vec!["api.example.com".to_string(), "files.example.com".to_string()]));
        for bad in [json!([]), json!(["*.example.com"]), json!([".example.com"]), json!(["API.example.com"]), json!(["api.example.com:443"]), json!(["127.0.0.1"]), json!(["localhost"]), json!(["a.example.com", 3]), json!((0..9).map(|i| format!("h{i}.example.com")).collect::<Vec<_>>()), json!("api.example.com")] {
            assert_eq!(hosts(&m(bad.clone())), None, "{bad}");
        }
        assert_eq!(hosts(&json!({"roles": [{"role": "smiles", "hosts": ["api.example.com"]}]})), None);
        assert_eq!(hosts(&json!({})), None);
        // (a structure found by its name: its hosts read the same, and what it goes out for said)
        let names = json!({"roles": [{"role": NAMES_ROLE, "hosts": ["pubchem.ncbi.nlm.nih.gov"]}]});
        assert_eq!(hosted_of(&names), Some((Hosted::Names, vec!["pubchem.ncbi.nlm.nih.gov".to_string()])));
        assert_eq!(hosted_of(&m(json!(["api.example.com"]))).map(|(k, _)| k), Some(Hosted::Model));
        // (both roles naming hosts: what it goes out for in doubt - none, as the page takes it for none)
        let both = json!({"roles": [{"role": ROLE, "hosts": ["api.example.com"]}, {"role": NAMES_ROLE, "hosts": ["pubchem.ncbi.nlm.nih.gov"]}]});
        assert_eq!(hosted_of(&both), None);
        assert_eq!(hosts(&both), None);
    }

    #[test]
    fn a_role_that_goes_out_is_all_its_plugin_does() {
        let names = json!({"role": NAMES_ROLE, "hosts": ["names.example.org"]});
        let with = |more: Value| {
            let mut m = json!({"roles": [names.clone()], "steps": [], "reads": [], "writes": []});
            m.as_object_mut().unwrap().extend(more.as_object().unwrap().clone());
            hosted_of(&m).map(|(k, _)| k)
        };
        // (alone, and with empty lists of nothing else: it fills that role)
        assert_eq!(with(json!({})), Some(Hosted::Names));
        // (beside another role, a step, a file it reads or writes: no way out at all)
        for more in [
            json!({"roles": [names.clone(), {"role": "smiles"}]}),
            json!({"roles": [{"role": "checks"}, {"role": ROLE, "hosts": ["api.example.com"]}]}),
            json!({"steps": [{"kind": "optimize"}]}),
            json!({"reads": ["orbitron"]}),
            json!({"writes": [{"kind": "orbitron"}]}),
            json!({"steps": "optimize"}),
        ] {
            assert_eq!(with(more.clone()), None, "{more}");
        }
        assert!(goes_out_for_a_role(&Hosted::Names.purpose("finder", &["names.example.org".into()])));
        assert!(goes_out_for_a_role(&Hosted::Model.purpose("talker", &["api.example.com".into()])));
        assert!(!goes_out_for_a_role("python-env:plugin-x"));
    }

    #[test]
    fn a_host_is_a_plain_public_name() {
        for bad in ["0x7f.1", "0x7f.0.0.1", "0xa.1", "0251.0xfe.0xa9.0xfe", "0x0.0", "10.1", "a.localhost", "localhost.localdomain", "names.localhost.example", "example.", "127.0.0.1"] {
            assert!(!host_ok(bad), "{bad}");
        }
        for good in ["pubchem.ncbi.nlm.nih.gov", "api.example.com", "x1.example.io", "data.example-host.net", "xn--bcher-kva.example"] {
            assert!(host_ok(good), "{good}");
        }
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    #[test]
    fn where_no_keychain_is_trusted_no_key_is_kept() {
        assert_eq!(SystemKeys.set("talker", KEY).unwrap_err(), NO_SAFE_PLACE);
        assert_eq!(SystemKeys.get("talker").unwrap_err(), NO_SAFE_PLACE);
    }
}
