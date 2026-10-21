//! Every connection Meno makes, seen, logged and answerable for.
//!
//! The web view makes none: its content security policy keeps it to the app
//! itself. What does reach the network - uv downloading Python and packages,
//! Python code run in the console - is started by the app as a child
//! process, and is pointed at a proxy the app runs on the loopback address.
//! The proxy lets a connection through only for a task the app began (the
//! task's token rides in the proxy credentials), only for a purpose the user
//! has allowed, only to a host the task's consent named, and not at all in
//! offline mode; it records each one - where to, for what, how much, how it
//! ended - in the app's data folder, and tells the window as it goes.

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

/// The most hosts a task's consent may name.
const MOST_HOSTS: usize = 64;

/// How long an idle connection is kept open.
const IDLE: Duration = Duration::from_secs(120);

/// How the window is told of a task or a connection: an event and its payload.
type Tell = Box<dyn Fn(&str, serde_json::Value) + Send + Sync>;

/// The network as Meno sees it: managed by the app, shared with the proxy.
#[derive(Default, Clone)]
pub struct Net(Arc<Inner>);

#[derive(Default)]
struct Inner {
    offline: AtomicBool,
    granted: Mutex<HashSet<String>>,
    /// Tasks under way, by token.
    tasks: Mutex<HashMap<String, Task>>,
    /// Recent connections, newest last.
    recent: Mutex<Vec<Connection>>,
    port: OnceLock<u16>,
    /// Tells the window: set when the app starts. Kept apart from the app
    /// itself so that nothing here that the tests reach draws in the
    /// window's code - a test binary on Windows cannot load what that needs.
    tell: OnceLock<Tell>,
    log: OnceLock<PathBuf>,
    /// One writer at a time, so that entries from connections ending
    /// together do not run into one another.
    log_lock: Mutex<()>,
    next: AtomicU64,
}

/// Something the app does that may need the network.
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    /// What it is for, as consent is given: "python-env:plugin-rdkit".
    pub purpose: String,
    /// What it is, in words: "Setting up RDKit".
    pub label: String,
    /// The hosts it may reach: those its consent named, each exact
    /// (`pypi.org`) or a leading dot for any host under one (`.hf.co`) -
    /// always some: no purpose goes out without asking, to any host.
    pub hosts: Option<Vec<String>>,
    pub started: u64,
    pub ended: Option<u64>,
    /// "done" or "failed" once ended.
    pub outcome: Option<String>,
}

/// One connection, or one refused.
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: u64,
    pub task_id: Option<String>,
    pub purpose: Option<String>,
    pub label: Option<String>,
    pub host: String,
    pub port: u16,
    pub started: u64,
    pub ended: Option<u64>,
    /// Bytes to the host, and from it.
    pub sent: u64,
    pub received: u64,
    /// "open", "done", "failed" or "blocked".
    pub outcome: String,
    pub reason: Option<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Net {
    pub fn offline(&self) -> bool {
        self.0.offline.load(Ordering::SeqCst)
    }

    /// Offline mode and the purposes allowed, as the settings saved them
    /// (`settings.json`, the window's: `{"network": {"offline", "granted"}}`),
    /// read as the app starts so that they hold before the window has loaded
    /// and said so itself. Taken as the window takes them (`acceptNetwork`,
    /// lib/settings/appSettings.ts): offline only when it says `true`, and
    /// purposes only as Meno names them. A file that cannot be read leaves
    /// the defaults: online, nothing allowed but the user's own code.
    pub fn load_settings(&self, path: &Path) {
        let Ok(text) = std::fs::read_to_string(path) else { return };
        let Ok(settings) = serde_json::from_str::<serde_json::Value>(&text) else { return };
        let network = &settings["network"];
        if let Some(offline) = network["offline"].as_bool() {
            self.0.offline.store(offline, Ordering::SeqCst);
        }
        if let Some(granted) = network["granted"].as_array() {
            let mut held = self.0.granted.lock().unwrap();
            let named = |p: &&str| {
                (1..=64).contains(&p.len())
                    && p.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b':' || b == b'-')
            };
            held.extend(granted.iter().filter_map(|p| p.as_str()).filter(named).map(String::from));
        }
    }

    /// The proxy's port - or, should it not be up, 0: a connection there is
    /// refused at once, so a child pointed at it reaches nothing rather than
    /// going out on its own.
    pub(crate) fn proxy_port(&self) -> u16 {
        self.0.port.get().copied().unwrap_or(0)
    }

    /// Whether the user has allowed `purpose`: every one is asked for.
    fn allowed(&self, purpose: &str) -> bool {
        self.0.granted.lock().unwrap().contains(purpose)
    }

    /// Begins a task that may use the network, to reach `hosts` alone - the
    /// hosts its consent named (`host_named`). Refused in offline mode, when
    /// its purpose has not been allowed, or when it names no hosts, or a
    /// pattern that is not a host's.
    pub fn begin(&self, purpose: &str, label: &str, hosts: Option<Vec<String>>) -> Result<TaskHandle, String> {
        if self.offline() {
            return Err(format!("{label}: Meno is offline"));
        }
        if !self.allowed(purpose) {
            return Err(format!("{label}: not allowed to use the network"));
        }
        match &hosts {
            None => return Err(format!("{label}: its consent named no hosts")),
            Some(h) if h.is_empty() || h.len() > MOST_HOSTS => return Err(format!("{label}: its consent named no hosts, or too many")),
            Some(h) => {
                if let Some(bad) = h.iter().find(|p| !pattern_ok(p)) {
                    return Err(format!("{label}: not a host: {bad}"));
                }
            }
        }
        let task = Task {
            id: uuid::Uuid::new_v4().to_string(),
            purpose: purpose.into(),
            label: label.into(),
            hosts,
            started: now_ms(),
            ended: None,
            outcome: None,
        };
        let token = uuid::Uuid::new_v4().simple().to_string();
        self.0.tasks.lock().unwrap().insert(token.clone(), task.clone());
        self.emit("net:task", &task);
        self.write_log(&serde_json::json!({ "task": task }));
        Ok(TaskHandle {
            net: self.clone(),
            token,
            ended: false,
        })
    }

    fn end(&self, token: &str, outcome: &str) {
        let Some(mut task) = self.0.tasks.lock().unwrap().remove(token) else {
            return;
        };
        task.ended = Some(now_ms());
        task.outcome = Some(outcome.into());
        self.emit("net:task", &task);
        self.write_log(&serde_json::json!({ "task": task }));
    }

    fn emit<T: Serialize>(&self, event: &str, payload: &T) {
        if let (Some(tell), Ok(value)) = (self.0.tell.get(), serde_json::to_value(payload)) {
            tell(event, value);
        }
    }

    fn write_log(&self, entry: &serde_json::Value) {
        let Some(path) = self.0.log.get() else { return };
        // the whole line in one write, one writer at a time
        let line = format!("{entry}\n");
        let _one = self.0.log_lock.lock().unwrap_or_else(|e| e.into_inner());
        append(path, &line, crate::logfile::MOST);
    }

    /// Keeps a connection's latest state among the recent ones and tells the
    /// window; a finished one also goes into the log.
    fn record(&self, c: &Connection) {
        {
            let mut recent = self.0.recent.lock().unwrap();
            match recent.iter_mut().find(|r| r.id == c.id) {
                Some(r) => *r = c.clone(),
                None => recent.push(c.clone()),
            }
            let over = recent.len().saturating_sub(1000);
            recent.drain(..over);
        }
        self.emit("net:connection", c);
        if c.outcome != "open" {
            self.write_log(&serde_json::json!({ "connection": c }));
        }
    }

    /// A connection refused before it was made, as the web view reports one.
    pub fn note_blocked(&self, host: &str, purpose: Option<&str>, reason: &str) {
        let c = Connection {
            id: self.0.next.fetch_add(1, Ordering::SeqCst),
            task_id: None,
            purpose: purpose.map(Into::into),
            label: None,
            host: host.into(),
            port: 0,
            started: now_ms(),
            ended: Some(now_ms()),
            sent: 0,
            received: 0,
            outcome: "blocked".into(),
            reason: Some(reason.into()),
        };
        self.record(&c);
    }
}

/// The port HTTPS takes: the only one a connection goes to, unless a host is
/// named with another (`host:port`).
const HTTPS_PORT: u16 = 443;

impl Task {
    /// Why it may not reach `host` at `port`, if it may not: a host its
    /// consent did not name - the user's own code reaches any - or a port
    /// not named for it, only HTTPS's where none is.
    fn refuses(&self, host: &str, port: u16) -> Option<&'static str> {
        let Some(named) = self.hosts.as_deref() else {
            return (port != HTTPS_PORT).then_some("not the port HTTPS takes");
        };
        if !host_named(named, host, None) {
            Some("not a host its consent named")
        } else if !host_named(named, host, Some(port)) {
            Some("not a port its consent named")
        } else {
            None
        }
    }
}

/// A pattern's name and port: `host` alone is HTTPS's port; `host:port`
/// that one - a number from 1 to 65535, written as such.
fn pattern_parts(pattern: &str) -> Option<(&str, u16)> {
    match pattern.rsplit_once(':') {
        None => Some((pattern, HTTPS_PORT)),
        Some((name, port)) => {
            let n: u16 = port.parse().ok()?;
            (n > 0 && port == n.to_string()).then_some((name, n))
        }
    }
}

/// Whether a pattern names a host: its name - lower-case letters, digits
/// and hyphens, in labels between dots - or, after a leading dot, the name
/// any host under which is meant, of two labels at least (`.hf.co`; never a
/// whole top-level domain, `.co`); and, after a colon, a port other than
/// HTTPS's where the host needs one.
fn pattern_ok(pattern: &str) -> bool {
    let Some((pattern, _)) = pattern_parts(pattern) else { return false };
    let (under, name) = match pattern.strip_prefix('.') {
        Some(name) => (true, name),
        None => (false, pattern),
    };
    let label_ok = |l: &str| {
        (1..=63).contains(&l.len())
            && l.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            && !l.starts_with('-')
            && !l.ends_with('-')
    };
    (1..=253).contains(&name.len()) && name.split('.').all(label_ok) && (!under || name.split('.').count() >= 2)
}

/// Whether `host` is one of those `named` - at `port`, where one is given:
/// one named as it is, or one under a name given with a leading dot -
/// `us.aws.cdn.hf.co` under `.hf.co`, but not `hf.co` itself, nor
/// `evilhf.co`. Whatever its case, and with or without the dot that may
/// end a name; a host that is not a name - one with any other character in
/// it - is none of them.
fn host_named(named: &[String], host: &str, port: Option<u16>) -> bool {
    let host = host.strip_suffix('.').unwrap_or(host).to_ascii_lowercase();
    if host.is_empty() || !host.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.') {
        return false;
    }
    named.iter().filter_map(|p| pattern_parts(p)).any(|(p, at)| {
        port.is_none_or(|port| port == at)
            && match p.strip_prefix('.') {
                Some(_) => host.strip_suffix(p).is_some_and(|sub| !sub.is_empty() && !sub.starts_with('.') && !sub.ends_with('.')),
                None => host == p,
            }
    })
}

/// Sets a child's proxy variables to `proxy`, both cases, and lets it reach
/// only the machine itself directly.
fn point_at_proxy(cmd: &mut Command, proxy: &str) {
    for key in ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"] {
        cmd.env(key, proxy).env(key.to_lowercase(), proxy);
    }
    for key in ["NO_PROXY", "no_proxy"] {
        cmd.env(key, "localhost,127.0.0.1,::1");
    }
}

/// Points a child at the proxy on `port` with no task's token
/// (`Net::route_nowhere`): what a job is given, as its runner checks it.
pub fn route_nowhere_at(cmd: &mut Command, port: u16) {
    point_at_proxy(cmd, &format!("http://127.0.0.1:{port}"));
}

impl Net {
    /// Points a child that may not use the network - a plugin's worker, or
    /// a job - at the proxy with no task's token: whatever it reaches for is
    /// refused, and goes on the record.
    pub fn route_nowhere(&self, cmd: &mut Command) {
        route_nowhere_at(cmd, self.proxy_port());
    }

    /// Binds the proxy's port on the loopback address, and knows it from
    /// then on.
    fn bind(&self) -> Option<std::net::TcpListener> {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).ok()?;
        let _ = self.0.port.set(listener.local_addr().ok()?.port());
        listener.set_nonblocking(true).ok()?;
        Some(listener)
    }
}

/// A task under way. Ended - as failed, unless said otherwise - when dropped.
pub struct TaskHandle {
    net: Net,
    token: String,
    ended: bool,
}

impl TaskHandle {
    /// Points a child process's connections at the proxy, as this task's.
    pub fn route(&self, cmd: &mut Command) {
        // The token as the password: Python's urllib sends proxy
        // credentials only when there is one.
        let port = self.net.proxy_port();
        point_at_proxy(cmd, &format!("http://meno:{}@127.0.0.1:{port}", self.token));
    }

    /// The proxy, as this task's, for a request Meno makes itself (the
    /// updater's): the URL a client is pointed at, credentials and all.
    pub fn proxy_url(&self) -> Option<String> {
        self.net.0.port.get().map(|port| format!("http://meno:{}@127.0.0.1:{port}", self.token))
    }

    pub fn finish(mut self, ok: bool) {
        self.net.end(&self.token, if ok { "done" } else { "failed" });
        self.ended = true;
    }
}

impl Drop for TaskHandle {
    fn drop(&mut self) {
        if !self.ended {
            self.net.end(&self.token, "failed");
        }
    }
}

/// Starts the proxy on the loopback address, and the log in `data`, with
/// the network's settings as they were saved. Both are in place when this
/// returns - before anything the window asks for can start a process: a
/// child begun earlier would have gone out on its own, past offline mode.
pub fn start(app: &AppHandle) {
    let net = app.state::<Net>().inner().clone();
    let window = app.clone();
    let _ = net.0.tell.set(Box::new(move |event, payload| {
        let _ = window.emit(event, payload);
    }));
    if let Ok(data) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&data);
        let _ = net.0.log.set(data.join("network-log.jsonl"));
        net.load_settings(&data.join("settings.json"));
    }
    // (bound here, its port known at once; served on the async runtime)
    let Some(listener) = net.bind() else { return };
    tauri::async_runtime::spawn(async move {
        let Ok(listener) = TcpListener::from_std(listener) else {
            return;
        };
        while let Ok((stream, _)) = listener.accept().await {
            let net = net.clone();
            tauri::async_runtime::spawn(async move { net.serve(stream).await });
        }
    });
}

/// A request to the proxy, as far as it matters here.
#[derive(Debug, PartialEq)]
pub struct ProxyRequest {
    pub method: String,
    pub host: String,
    pub port: u16,
    /// The token of the task it comes from, from the proxy credentials.
    pub token: Option<String>,
}

/// Reads the head of a request to the proxy: its method, where to, and the
/// token in its credentials (Basic: the password, or the user name when
/// there is no password).
pub fn parse_request(head: &str) -> Option<ProxyRequest> {
    let mut lines = head.split("\r\n");
    let mut first = lines.next()?.split_whitespace();
    let method = first.next()?.to_string();
    let target = first.next()?;
    let (host, port) = if method == "CONNECT" {
        split_host_port(target, 443)?
    } else {
        // an absolute URL: http://host[:port]/path
        let rest = target.split_once("://").map(|(_, r)| r).unwrap_or(target);
        let authority = rest.split('/').next()?;
        split_host_port(authority, 80)?
    };
    let token = lines.find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if !name.trim().eq_ignore_ascii_case("proxy-authorization") {
            return None;
        }
        let encoded = value.trim().strip_prefix("Basic ")?;
        let decoded = decode_base64(encoded.trim())?;
        let text = String::from_utf8(decoded).ok()?;
        let (user, password) = text.split_once(':').unwrap_or((&text, ""));
        Some(if password.is_empty() { user } else { password }.to_string())
    });
    Some(ProxyRequest {
        method,
        host,
        port,
        token,
    })
}

fn split_host_port(authority: &str, default: u16) -> Option<(String, u16)> {
    if let Some(rest) = authority.strip_prefix('[') {
        // [v6]:port
        let (host, after) = rest.split_once(']')?;
        let port = after.strip_prefix(':').map(str::parse).transpose().ok()?;
        return Some((host.to_string(), port.unwrap_or(default)));
    }
    match authority.rsplit_once(':') {
        Some((host, port)) => Some((host.to_string(), port.parse().ok()?)),
        None => Some((authority.to_string(), default)),
    }
}

fn decode_base64(text: &str) -> Option<Vec<u8>> {
    let value = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => return None,
        } as u32)
    };
    let bytes: Vec<u8> = text.bytes().filter(|&c| c != b'=').collect();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    for chunk in bytes.chunks(4) {
        let mut n = 0u32;
        for (i, &c) in chunk.iter().enumerate() {
            n |= value(c)? << (18 - 6 * i);
        }
        let take = chunk.len().saturating_sub(1);
        out.extend_from_slice(&n.to_be_bytes()[1..1 + take]);
    }
    Some(out)
}

impl Net {
    async fn serve(&self, mut client: TcpStream) {
        // the request's head, up to its blank line
        let mut head = Vec::new();
        let mut buf = [0u8; 1024];
        while !head.windows(4).any(|w| w == b"\r\n\r\n") {
            let read = tokio::time::timeout(Duration::from_secs(10), client.read(&mut buf)).await;
            match read {
                Ok(Ok(n)) if n > 0 => head.extend_from_slice(&buf[..n]),
                _ => return,
            }
            if head.len() > 16 * 1024 {
                return;
            }
        }
        let Some(request) = parse_request(&String::from_utf8_lossy(&head)) else {
            let _ = client.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\n").await;
            return;
        };
        let task = request
            .token
            .as_deref()
            .and_then(|t| self.0.tasks.lock().unwrap().get(t).cloned());
        let mut c = Connection {
            id: self.0.next.fetch_add(1, Ordering::SeqCst),
            task_id: task.as_ref().map(|t| t.id.clone()),
            purpose: task.as_ref().map(|t| t.purpose.clone()),
            label: task.as_ref().map(|t| t.label.clone()),
            host: request.host.clone(),
            port: request.port,
            started: now_ms(),
            ended: None,
            sent: 0,
            received: 0,
            outcome: "open".into(),
            reason: None,
        };
        let refusal = if request.method != "CONNECT" {
            Some(("405 Method Not Allowed", "only encrypted connections go through Meno"))
        } else if self.offline() {
            Some(("403 Forbidden", "Meno is offline"))
        } else if task.is_none() {
            Some(("407 Proxy Authentication Required", "not from a task Meno began"))
        } else if !self.allowed(c.purpose.as_deref().unwrap_or("")) {
            Some(("403 Forbidden", "not allowed to use the network"))
        } else {
            // (a host or a port its consent did not name)
            task.as_ref().and_then(|t| t.refuses(&request.host, request.port)).map(|why| ("403 Forbidden", why))
        };
        if let Some((status, reason)) = refusal {
            let _ = client
                .write_all(format!("HTTP/1.1 {status}\r\n\r\n").as_bytes())
                .await;
            c.outcome = "blocked".into();
            c.reason = Some(reason.into());
            c.ended = Some(now_ms());
            self.record(&c);
            return;
        }
        self.record(&c);
        let upstream = tokio::time::timeout(
            Duration::from_secs(20),
            TcpStream::connect((request.host.as_str(), request.port)),
        )
        .await;
        let upstream = match upstream {
            Ok(Ok(s)) => s,
            Ok(Err(e)) => return self.fail(&mut client, c, &e.to_string()).await,
            Err(_) => return self.fail(&mut client, c, "timed out").await,
        };
        if client
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            .await
            .is_err()
        {
            return;
        }
        self.pipe(client, upstream, c).await;
    }

    async fn fail(&self, client: &mut TcpStream, mut c: Connection, why: &str) {
        let _ = client.write_all(b"HTTP/1.1 502 Bad Gateway\r\n\r\n").await;
        c.outcome = "failed".into();
        c.reason = Some(why.into());
        c.ended = Some(now_ms());
        self.record(&c);
    }

    /// Carries the connection both ways, counting, and telling the window
    /// how it goes twice a second.
    async fn pipe(&self, client: TcpStream, upstream: TcpStream, mut c: Connection) {
        let sent = Arc::new(AtomicU64::new(0));
        let received = Arc::new(AtomicU64::new(0));
        let (cr, cw) = client.into_split();
        let (ur, uw) = upstream.into_split();
        let up = tokio::spawn(copy(cr, uw, sent.clone()));
        let down = tokio::spawn(copy(ur, cw, received.clone()));
        let done = async {
            let _ = tokio::join!(up, down);
        };
        tokio::pin!(done);
        loop {
            tokio::select! {
                _ = &mut done => break,
                _ = tokio::time::sleep(Duration::from_millis(500)) => {
                    c.sent = sent.load(Ordering::Relaxed);
                    c.received = received.load(Ordering::Relaxed);
                    self.record(&c);
                }
            }
        }
        c.sent = sent.load(Ordering::Relaxed);
        c.received = received.load(Ordering::Relaxed);
        c.outcome = "done".into();
        c.ended = Some(now_ms());
        self.record(&c);
    }
}

async fn copy(
    mut from: tokio::net::tcp::OwnedReadHalf,
    mut to: tokio::net::tcp::OwnedWriteHalf,
    count: Arc<AtomicU64>,
) {
    let mut buf = vec![0u8; 16 * 1024];
    loop {
        let n = match tokio::time::timeout(IDLE, from.read(&mut buf)).await {
            Ok(Ok(n)) if n > 0 => n,
            _ => break,
        };
        if to.write_all(&buf[..n]).await.is_err() {
            break;
        }
        count.fetch_add(n as u64, Ordering::Relaxed);
    }
    let _ = to.shutdown().await;
}

// --- Commands --------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetState {
    offline: bool,
    granted: Vec<String>,
    tasks: Vec<Task>,
    connections: Vec<Connection>,
}

#[tauri::command]
pub fn net_state(net: tauri::State<'_, Net>) -> NetState {
    let mut granted: Vec<String> = net.0.granted.lock().unwrap().iter().cloned().collect();
    granted.sort();
    NetState {
        offline: net.offline(),
        granted,
        tasks: net.0.tasks.lock().unwrap().values().cloned().collect(),
        connections: net.0.recent.lock().unwrap().clone(),
    }
}

#[tauri::command]
pub fn net_set_offline(net: tauri::State<'_, Net>, offline: bool) {
    net.0.offline.store(offline, Ordering::SeqCst);
}

#[tauri::command]
pub fn net_grant(net: tauri::State<'_, Net>, purpose: String) {
    net.0.granted.lock().unwrap().insert(purpose);
}

#[tauri::command]
pub fn net_revoke(net: tauri::State<'_, Net>, purpose: String) {
    net.0.granted.lock().unwrap().remove(&purpose);
}

/// A connection the web view was kept from making, for the record.
#[tauri::command]
pub fn net_note_blocked(net: tauri::State<'_, Net>, host: String, reason: String) {
    net.note_blocked(&host, Some("web-view"), &reason);
}

/// `line` added to the record at `path`, kept under `most` bytes as Meno's
/// log is (logfile.rs): past that it is begun again, the one before kept as
/// network-log.jsonl.1, one only.
fn append(path: &Path, line: &str, most: u64) {
    // (where it can be neither begun again nor emptied, added to all the same:
    // a connection is not left off the record while it can be written)
    let _ = crate::logfile::room_for(path, line.len() as u64, most);
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_where_a_request_goes_and_whose_it_is() {
        // "token:" in base64 is dG9rZW46
        let head = "CONNECT pypi.org:443 HTTP/1.1\r\nHost: pypi.org:443\r\nProxy-Authorization: Basic dG9rZW46\r\n\r\n";
        assert_eq!(
            parse_request(head),
            Some(ProxyRequest {
                method: "CONNECT".into(),
                host: "pypi.org".into(),
                port: 443,
                token: Some("token".into()),
            })
        );
        let plain = parse_request("GET http://example.com/x HTTP/1.1\r\n\r\n").unwrap();
        assert_eq!((plain.method.as_str(), plain.host.as_str(), plain.port), ("GET", "example.com", 80));
        assert_eq!(plain.token, None);
        // the token as the password, as Meno gives it
        let as_password = "CONNECT pypi.org:443 HTTP/1.1\r\nProxy-Authorization: Basic bWVubzp0b2tlbg==\r\n\r\n";
        assert_eq!(parse_request(as_password).unwrap().token.as_deref(), Some("token"));
        let v6 = parse_request("CONNECT [2001:db8::1]:8443 HTTP/1.1\r\n\r\n").unwrap();
        assert_eq!((v6.host.as_str(), v6.port), ("2001:db8::1", 8443));
        assert_eq!(parse_request(""), None);
    }

    #[test]
    fn decodes_the_credentials() {
        assert_eq!(decode_base64("dG9rZW46").unwrap(), b"token:");
        assert_eq!(decode_base64("YQ==").unwrap(), b"a");
        assert_eq!(decode_base64("YWI=").unwrap(), b"ab");
        assert_eq!(decode_base64("!!"), None);
    }

    #[test]
    fn keeps_every_entry_whole_when_many_are_written_at_once() {
        let path = std::env::temp_dir().join(format!("meno-net-log-{}.jsonl", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let net = Net::default();
        let _ = net.0.log.set(path.clone());
        let threads: Vec<_> = (0..8)
            .map(|t| {
                let net = net.clone();
                std::thread::spawn(move || {
                    for i in 0..200 {
                        net.note_blocked(&format!("host-{t}-{i}.example"), None, "a reason long enough to be written in more than one piece");
                    }
                })
            })
            .collect();
        for t in threads {
            t.join().unwrap();
        }
        let text = std::fs::read_to_string(&path).unwrap();
        let _ = std::fs::remove_file(&path);
        let lines: Vec<_> = text.lines().collect();
        assert_eq!(lines.len(), 8 * 200);
        for line in lines {
            let entry: serde_json::Value = serde_json::from_str(line).expect(line);
            assert_eq!(entry["connection"]["outcome"], "blocked");
        }
    }

    #[test]
    fn the_record_is_begun_again_past_its_size_the_one_before_kept() {
        let dir = std::env::temp_dir().join(format!("meno-net-log-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("network-log.jsonl");
        let before = dir.join("network-log.jsonl.1");
        let entry = |i: usize| format!("{}\n", serde_json::json!({ "connection": { "host": format!("host-{i}.example") } }));
        let line = entry(0);
        let n = line.len() as u64;
        // (room for two lines and not three)
        let most = 2 * n + n / 2;
        append(&path, &entry(1), most);
        append(&path, &entry(2), most);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), entry(1) + &entry(2));
        // (a third would pass it: the two before go to network-log.jsonl.1)
        append(&path, &entry(3), most);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), entry(3));
        assert_eq!(std::fs::read_to_string(&before).unwrap(), entry(1) + &entry(2));
        // (and again: the oldest gone, one before kept)
        append(&path, &entry(4), most);
        append(&path, &entry(5), most);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), entry(5));
        assert_eq!(std::fs::read_to_string(&before).unwrap(), entry(3) + &entry(4));
        assert!(!dir.join("network-log.jsonl.2").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Hosts, as a task's consent names them.
    fn named(hosts: &[&str]) -> Option<Vec<String>> {
        Some(hosts.iter().map(|h| h.to_string()).collect())
    }

    #[test]
    fn begins_a_task_only_when_allowed_and_online() {
        let net = Net::default();
        assert!(net.begin("python-env:plugin-rdkit", "Setting up", named(&["pypi.org"])).is_err());
        net.0.granted.lock().unwrap().insert("python-env:plugin-rdkit".into());
        let task = net.begin("python-env:plugin-rdkit", "Setting up", named(&["pypi.org"])).unwrap();
        assert_eq!(net.0.tasks.lock().unwrap().len(), 1);
        task.finish(true);
        assert!(net.0.tasks.lock().unwrap().is_empty());
        // offline, nothing goes, even what was allowed
        net.0.offline.store(true, Ordering::SeqCst);
        assert!(net.begin("python-env:plugin-rdkit", "Setting up", named(&["pypi.org"])).is_err());
    }

    #[test]
    fn needs_asking_for_every_purpose() {
        // (the console's code, which once needed none, went with the console)
        let net = Net::default();
        for purpose in ["python-code", "ccd", "app-update", "python-env:plugin-rdkit", ""] {
            assert!(!net.allowed(purpose), "{purpose}");
            assert!(net.begin(purpose, "Testing", named(&["pypi.org"])).is_err(), "{purpose}");
            assert!(net.begin(purpose, "Testing", None).is_err(), "{purpose}");
        }
    }

    #[test]
    fn begins_no_task_that_names_no_hosts() {
        let net = Net::default();
        net.0.granted.lock().unwrap().insert("python-env:console".into());
        // a set-up must name the hosts its consent named
        let none = net.begin("python-env:console", "Setting up", None).err().unwrap();
        assert_eq!(none, "Setting up: its consent named no hosts");
        assert!(net.begin("python-env:console", "Setting up", named(&[])).is_err());
        assert!(net.0.tasks.lock().unwrap().is_empty());
        // and only hosts: no pattern for a whole top-level domain, nor anything else
        for bad in [".co", "*.hf.co", "PyPI.org", "pypi.org:0", "pypi.org:65536", "pypi.org:", "pypi.org:0443", "https://pypi.org", "a..b", "-a.org", ""] {
            assert!(net.begin("python-env:console", "Setting up", named(&["pypi.org", bad])).is_err(), "{bad}");
        }
        let task = net.begin("python-env:console", "Setting up", named(&["pypi.org", ".hf.co", "127.0.0.1"])).unwrap();
        let held = net.0.tasks.lock().unwrap().values().next().unwrap().hosts.clone();
        assert_eq!(held, named(&["pypi.org", ".hf.co", "127.0.0.1"]));
        task.finish(true);
    }

    #[test]
    fn knows_a_host_named_and_one_under_a_name_given_with_a_leading_dot() {
        let hosts = named(&["pypi.org", ".hf.co"]).unwrap();
        for host in ["pypi.org", "PyPI.org", "pypi.org.", "us.aws.cdn.hf.co", "cas-bridge.xethub.hf.co"] {
            assert!(host_named(&hosts, host, Some(443)), "{host}");
        }
        // a host under one named exactly is not named; nor is the name a leading dot is put before
        for host in ["files.pypi.org", "hf.co", "evilhf.co", "hf.co.example.com", ".hf.co", "x..hf.co", "us.aws.cdn.hf.co\0", "pypi.org/", "", "example.com"] {
            assert!(!host_named(&hosts, host, None), "{host}");
        }
        assert!(pattern_ok("pypi.org") && pattern_ok(".hf.co") && pattern_ok("127.0.0.1") && pattern_ok("localhost") && pattern_ok("example.org:8443"));
        assert!(!pattern_ok(".co") && !pattern_ok(".") && !pattern_ok("hf.co.") && !pattern_ok("a_b.org"));
    }

    #[test]
    fn holds_a_task_to_the_port_https_takes_unless_its_host_is_named_with_another() {
        let hosts = named(&["pypi.org", ".hf.co", "example.org:8443"]).unwrap();
        // HTTPS's port alone, where none is named
        assert!(host_named(&hosts, "pypi.org", Some(443)) && host_named(&hosts, "us.aws.cdn.hf.co", Some(443)));
        for port in [80, 22, 8080] {
            assert!(!host_named(&hosts, "pypi.org", Some(port)), "{port}");
        }
        // another where it is named, and that one alone
        assert!(host_named(&hosts, "example.org", Some(8443)));
        assert!(!host_named(&hosts, "example.org", Some(443)) && !host_named(&hosts, "example.org", Some(80)));
        let task = Task { id: "t".into(), purpose: "python-env:test".into(), label: "Testing".into(), started: 0, ended: None, outcome: None, hosts: Some(hosts) };
        assert_eq!(task.refuses("pypi.org", 443), None);
        assert_eq!(task.refuses("pypi.org", 80), Some("not a port its consent named"));
        assert_eq!(task.refuses("example.com", 443), Some("not a host its consent named"));
    }

    fn encode_base64(bytes: &[u8]) -> String {
        const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::new();
        for chunk in bytes.chunks(3) {
            let n = chunk.iter().enumerate().fold(0u32, |n, (i, &b)| n | (b as u32) << (16 - 8 * i));
            for i in 0..4 {
                out.push(if i <= chunk.len() { A[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
            }
        }
        out
    }

    /// Asks the proxy at `port` to connect to `to`, as `token`'s; the status line it answers.
    async fn ask(port: u16, to: u16, token: Option<&str>) -> (TcpStream, String) {
        ask_for(port, "127.0.0.1", to, token).await
    }

    /// Asks the proxy at `port` to connect to `host`'s port `to`, as `token`'s; the status line it answers.
    async fn ask_for(port: u16, host: &str, to: u16, token: Option<&str>) -> (TcpStream, String) {
        let mut c = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        let auth = token
            .map(|t| format!("Proxy-Authorization: Basic {}\r\n", encode_base64(format!("meno:{t}").as_bytes())))
            .unwrap_or_default();
        c.write_all(format!("CONNECT {host}:{to} HTTP/1.1\r\n{auth}\r\n").as_bytes())
            .await
            .unwrap();
        let mut head = Vec::new();
        let mut b = [0u8; 1];
        while !head.ends_with(b"\r\n\r\n") && c.read(&mut b).await.unwrap() == 1 {
            head.push(b[0]);
        }
        let status = String::from_utf8_lossy(&head).lines().next().unwrap_or("").to_string();
        (c, status)
    }

    /// Somewhere to go on the loopback address - it says back what it is
    /// told, once - and the proxy, served: the network, the proxy's port,
    /// and the port of the place to go.
    async fn proxy_and_echo() -> (Net, u16, u16) {
        let echo = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let to = echo.local_addr().unwrap().port();
        tokio::spawn(async move {
            while let Ok((mut s, _)) = echo.accept().await {
                tokio::spawn(async move {
                    let mut b = [0u8; 64];
                    let n = s.read(&mut b).await.unwrap_or(0);
                    let _ = s.write_all(&b[..n]).await;
                });
            }
        });
        let net = Net::default();
        let proxy = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = proxy.local_addr().unwrap().port();
        let _ = net.0.port.set(port);
        let serving = net.clone();
        tokio::spawn(async move {
            while let Ok((s, _)) = proxy.accept().await {
                let n = serving.clone();
                tokio::spawn(async move { n.serve(s).await });
            }
        });
        (net, port, to)
    }

    /// Says `hello` through a connection the proxy carries, and hears it back.
    async fn hello(c: &mut TcpStream) {
        c.write_all(b"hello").await.unwrap();
        let mut back = [0u8; 5];
        c.read_exact(&mut back).await.unwrap();
        assert_eq!(&back, b"hello");
    }

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()
    }

    #[test]
    fn carries_a_tasks_connection_counted_and_refuses_the_rest() {
        runtime().block_on(async {
            let (net, port, to) = proxy_and_echo().await;
            net.0.granted.lock().unwrap().insert("python-env:test".into());
            // (the echo's port named: not HTTPS's)
            let task = net.begin("python-env:test", "Testing", Some(vec![format!("127.0.0.1:{to}")])).unwrap();

            // the task's own: through, both ways, counted
            let (mut c, status) = ask(port, to, Some(&task.token)).await;
            assert_eq!(status, "HTTP/1.1 200 Connection Established");
            hello(&mut c).await;
            drop(c);
            let done = loop {
                let found = net.0.recent.lock().unwrap().iter().find(|c| c.outcome == "done").cloned();
                if let Some(c) = found {
                    break c;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            };
            assert_eq!((done.sent, done.received), (5, 5));
            assert_eq!(done.purpose.as_deref(), Some("python-env:test"));
            assert_eq!(done.host, "127.0.0.1");

            // nobody's: refused
            let (_, status) = ask(port, to, None).await;
            assert_eq!(status, "HTTP/1.1 407 Proxy Authentication Required");
            // offline: refused, even the task's own
            net.0.offline.store(true, Ordering::SeqCst);
            let (_, status) = ask(port, to, Some(&task.token)).await;
            assert_eq!(status, "HTTP/1.1 403 Forbidden");
            let blocked = net.0.recent.lock().unwrap().iter().filter(|c| c.outcome == "blocked").count();
            assert_eq!(blocked, 2);
        });
    }

    #[test]
    fn carries_a_task_only_to_the_hosts_its_consent_named() {
        runtime().block_on(async {
            let (net, port, to) = proxy_and_echo().await;
            net.0.granted.lock().unwrap().insert("python-env:test".into());

            // a host named: through
            let task = net.begin("python-env:test", "Testing", Some(vec!["pypi.org".into(), format!("127.0.0.1:{to}")])).unwrap();
            let (mut c, status) = ask(port, to, Some(&task.token)).await;
            assert_eq!(status, "HTTP/1.1 200 Connection Established");
            hello(&mut c).await;
            drop(c);
            task.finish(true);

            // one not named: refused before anything is reached, and on the record as blocked
            let task = net.begin("python-env:test", "Testing", named(&["pypi.org", ".hf.co"])).unwrap();
            let (_, status) = ask(port, to, Some(&task.token)).await;
            assert_eq!(status, "HTTP/1.1 403 Forbidden");
            // (nor the name a leading dot is put before: the hosts under it alone)
            let (_, status) = ask_for(port, "hf.co", 443, Some(&task.token)).await;
            assert_eq!(status, "HTTP/1.1 403 Forbidden");
            let blocked: Vec<Connection> = net.0.recent.lock().unwrap().iter().filter(|c| c.outcome == "blocked").cloned().collect();
            assert_eq!(blocked.len(), 2);
            for (c, host) in blocked.iter().zip(["127.0.0.1", "hf.co"]) {
                assert_eq!(c.host, host);
                assert_eq!(c.purpose.as_deref(), Some("python-env:test"));
                assert_eq!(c.reason.as_deref(), Some("not a host its consent named"));
            }
            task.finish(true);

            // a host named, at a port not named for it: refused
            let task = net.begin("python-env:test", "Testing", named(&["127.0.0.1"])).unwrap();
            let (_, status) = ask(port, to, Some(&task.token)).await;
            assert_eq!(status, "HTTP/1.1 403 Forbidden");
            let why: Vec<Option<String>> = net.0.recent.lock().unwrap().iter().filter(|c| c.outcome == "blocked").map(|c| c.reason.clone()).collect();
            assert_eq!(why[2..], [Some("not a port its consent named".to_string())]);
            task.finish(true);
        });
    }

    #[test]
    fn puts_a_connection_refused_for_its_host_on_the_record_with_why() {
        let path = std::env::temp_dir().join(format!("meno-net-hosts-{}.jsonl", uuid::Uuid::new_v4()));
        runtime().block_on(async {
            let (net, port, to) = proxy_and_echo().await;
            let _ = net.0.log.set(path.clone());
            net.0.granted.lock().unwrap().insert("python-env:test".into());
            let task = net.begin("python-env:test", "Testing", named(&["pypi.org"])).unwrap();
            let (_, status) = ask(port, to, Some(&task.token)).await;
            assert_eq!(status, "HTTP/1.1 403 Forbidden");
            task.finish(true);
        });
        let text = std::fs::read_to_string(&path).unwrap();
        let _ = std::fs::remove_file(&path);
        let entries: Vec<serde_json::Value> = text.lines().map(|l| serde_json::from_str(l).unwrap()).collect();
        let c = entries.iter().find_map(|e| e.get("connection")).expect("the connection, on the record");
        assert_eq!((c["host"].as_str(), c["outcome"].as_str()), (Some("127.0.0.1"), Some("blocked")));
        assert_eq!(c["reason"], "not a host its consent named");
        // (and the task, with the hosts its consent named)
        assert_eq!(entries[0]["task"]["hosts"], serde_json::json!(["pypi.org"]));
    }

    #[test]
    fn routes_a_child_that_needs_no_network_to_the_proxy_without_a_token() {
        let net = Net::default();
        let _ = net.0.port.set(4567);
        let mut cmd = Command::new("true");
        net.route_nowhere(&mut cmd);
        let proxy = cmd
            .get_envs()
            .find(|(k, _)| k.to_string_lossy().eq_ignore_ascii_case("HTTPS_PROXY"))
            .and_then(|(_, v)| v)
            .map(|v| v.to_string_lossy().into_owned());
        assert_eq!(proxy.as_deref(), Some("http://127.0.0.1:4567"));
    }

    /// The proxy a command was pointed at, by `HTTPS_PROXY` whatever its case.
    fn proxy_of(cmd: &Command) -> Option<String> {
        cmd.get_envs()
            .find(|(k, _)| k.to_string_lossy().eq_ignore_ascii_case("HTTPS_PROXY"))
            .and_then(|(_, v)| v)
            .map(|v| v.to_string_lossy().into_owned())
    }

    #[test]
    fn points_a_child_at_no_port_at_all_while_the_proxy_is_not_up() {
        // (not left without a proxy, to go out on its own)
        let net = Net::default();
        let mut nowhere = Command::new("true");
        net.route_nowhere(&mut nowhere);
        assert_eq!(proxy_of(&nowhere).as_deref(), Some("http://127.0.0.1:0"));
        net.0.granted.lock().unwrap().insert("python-env:test".into());
        let task = net.begin("python-env:test", "Testing", named(&["pypi.org"])).unwrap();
        let mut routed = Command::new("true");
        task.route(&mut routed);
        assert!(proxy_of(&routed).unwrap().ends_with("@127.0.0.1:0"));
    }

    #[test]
    fn knows_its_port_once_bound() {
        let net = Net::default();
        let listener = net.bind().expect("a port on the loopback address");
        let port = listener.local_addr().unwrap().port();
        let mut cmd = Command::new("true");
        net.route_nowhere(&mut cmd);
        assert_eq!(proxy_of(&cmd), Some(format!("http://127.0.0.1:{port}")));
    }

    #[test]
    fn takes_offline_mode_and_what_was_allowed_from_the_saved_settings() {
        let dir = std::env::temp_dir().join(format!("meno-net-settings-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");

        let offline = Net::default();
        std::fs::write(
            &path,
            r#"{"format":1,"network":{"offline":true,"granted":["app-update","python-env:chem","Not A Purpose!"]}}"#,
        )
        .unwrap();
        offline.load_settings(&path);
        assert!(offline.offline());
        assert!(offline.allowed("app-update") && offline.allowed("python-env:chem"));
        assert!(!offline.allowed("Not A Purpose!"));
        // offline, not even what was allowed goes out
        assert!(offline.begin("app-update", "Updating", named(&["github.com"])).is_err());

        // missing or unreadable: the defaults, as the window takes them
        for text in [None, Some("not json"), Some(r#"{"network":{"offline":"yes"}}"#)] {
            let net = Net::default();
            match text {
                Some(text) => std::fs::write(&path, text).unwrap(),
                None => {
                    let _ = std::fs::remove_file(&path);
                }
            }
            net.load_settings(&path);
            assert!(!net.offline(), "{text:?}");
            assert!(!net.allowed("app-update"), "{text:?}");
            assert!(net.begin("app-update", "Updating", named(&["github.com"])).is_err(), "{text:?}");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn routes_a_child_through_the_proxy_with_its_token() {
        let net = Net::default();
        let _ = net.0.port.set(4567);
        net.0.granted.lock().unwrap().insert("python-env:test".into());
        let task = net.begin("python-env:test", "Testing", named(&["pypi.org"])).unwrap();
        let mut cmd = Command::new("true");
        task.route(&mut cmd);
        // by name, whatever its case: on Windows HTTPS_PROXY and
        // https_proxy are one variable
        let env: HashMap<_, _> = cmd
            .get_envs()
            .map(|(k, v)| {
                let name = k.to_string_lossy().to_uppercase();
                (name, v.map(|v| v.to_string_lossy().into_owned()))
            })
            .collect();
        let proxy = env["HTTPS_PROXY"].clone().unwrap();
        assert!(proxy.starts_with("http://meno:") && proxy.ends_with("@127.0.0.1:4567"));
        for name in ["HTTP_PROXY", "ALL_PROXY"] {
            assert_eq!(env[name].as_ref(), Some(&proxy), "{name}");
        }
        assert_eq!(env["NO_PROXY"].as_deref(), Some("localhost,127.0.0.1,::1"));
        // elsewhere the lower-case names are set too, as some programs read only those
        if !cfg!(windows) {
            let lower: Vec<_> = cmd.get_envs().map(|(k, _)| k.to_string_lossy().into_owned()).collect();
            assert!(lower.iter().any(|k| k == "https_proxy"));
        }
    }
}
