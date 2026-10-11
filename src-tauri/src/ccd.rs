//! Chemical components from the wwPDB's Chemical Component Dictionary
//! (CC0): each component's mmCIF file, fetched once from the wwPDB's own
//! archive and kept in Meno's cache, for the window to read
//! (lib/chem/ccd.ts) - a PDB entry's residues given their bond orders.
//!
//! It goes on the network only as Meno's network lets it (net.rs): as a
//! task with the "ccd" purpose - refused when Meno is offline, or until the
//! user has allowed it - whose requests go through Meno's proxy. Only the
//! components' names leave Meno, in the files' paths.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::net::Net;

/// The purpose Meno's network knows the lookup by.
pub const PURPOSE: &str = "ccd";

const LABEL: &str = "Looking up chemical components";

/// Whether a name can be a component's id: one to five capital letters and
/// digits, as the dictionary's are - and so safe in a path and a URL.
pub fn valid_id(id: &str) -> bool {
    (1..=5).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

/// Where the wwPDB keeps a component's file: in the folder of its id's last
/// character, then its id's (`refdata/chem_comp/N/BTN/BTN.cif`).
pub fn url_of(id: &str) -> String {
    let last = &id[id.len() - 1..];
    format!("https://files.wwpdb.org/pub/pdb/refdata/chem_comp/{last}/{id}/{id}.cif")
}

/// What is known of the components asked for.
#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Components {
    /// Each component's file, by id.
    pub found: HashMap<String, String>,
    /// Ids the dictionary has no file for.
    pub absent: Vec<String>,
    /// Ids not kept yet, where nothing was fetched.
    pub missing: Vec<String>,
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("ccd");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// The components kept in `dir`, and the ids that are not.
pub fn held(dir: &Path, ids: &[String]) -> (HashMap<String, String>, Vec<String>) {
    let mut found = HashMap::new();
    let mut missing = Vec::new();
    for id in ids {
        match std::fs::read_to_string(dir.join(format!("{id}.cif"))) {
            Ok(text) => {
                found.insert(id.clone(), text);
            }
            Err(_) => missing.push(id.clone()),
        }
    }
    (found, missing)
}

/// Keeps a component's file: written whole, then put in place, so that a
/// file half written is never read as kept.
fn keep(dir: &Path, id: &str, text: &str) -> Result<(), String> {
    let part = dir.join(format!("{id}.cif.part"));
    std::fs::write(&part, text).map_err(|e| e.to_string())?;
    std::fs::rename(&part, dir.join(format!("{id}.cif"))).map_err(|e| e.to_string())
}

/// Whether a file is a component's: its first data block is the id's (a
/// page saying something went wrong is not).
pub fn is_component(id: &str, text: &str) -> bool {
    text.lines().map(str::trim).find(|l| !l.is_empty() && !l.starts_with('#')).is_some_and(|l| l.eq_ignore_ascii_case(&format!("data_{id}")))
}

/// The components named: those kept; and, with `fetch`, the rest fetched
/// from the wwPDB and kept - else listed as `missing`.
#[tauri::command]
pub async fn ccd_components(app: AppHandle, ids: Vec<String>, fetch: bool) -> Result<Components, String> {
    let mut ids: Vec<String> = ids.into_iter().filter(|id| valid_id(id)).collect();
    ids.sort();
    ids.dedup();
    let dir = cache_dir(&app)?;
    let (mut found, missing) = held(&dir, &ids);
    if !fetch || missing.is_empty() {
        return Ok(Components { found, absent: Vec::new(), missing });
    }
    // (refused here when Meno is offline, or the lookup is not allowed)
    let task = app.state::<Net>().begin(PURPOSE, LABEL)?;
    let proxy = task.proxy_url().ok_or("Meno's network is not up")?;
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("Meno/", env!("CARGO_PKG_VERSION")))
        .proxy(reqwest::Proxy::all(&proxy).map_err(|e| format!("proxy: {e}"))?)
        .build()
        .map_err(|e| format!("client: {e}"))?;
    let mut absent = Vec::new();
    for id in missing {
        let url = url_of(&id);
        let response = client.get(&url).send().await.map_err(|e| format!("fetching {url}: {e}"))?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            absent.push(id);
            continue;
        }
        let response = response.error_for_status().map_err(|e| format!("fetching {url}: {e}"))?;
        let text = response.text().await.map_err(|e| format!("fetching {url}: {e}"))?;
        if !is_component(&id, &text) {
            return Err(format!("{url} is not the component's file"));
        }
        keep(&dir, &id, &text)?;
        found.insert(id, text);
    }
    task.finish(true);
    Ok(Components { found, absent, missing: Vec::new() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_only_names_a_component_can_have() {
        assert!(valid_id("BTN") && valid_id("HOH") && valid_id("A1AB2") && valid_id("5"));
        assert!(!valid_id("") && !valid_id("ABCDEF") && !valid_id("btn") && !valid_id("../x") && !valid_id("A B"));
    }

    #[test]
    fn finds_a_component_where_the_wwpdb_keeps_it() {
        assert_eq!(url_of("BTN"), "https://files.wwpdb.org/pub/pdb/refdata/chem_comp/N/BTN/BTN.cif");
        assert_eq!(url_of("ZN"), "https://files.wwpdb.org/pub/pdb/refdata/chem_comp/N/ZN/ZN.cif");
    }

    #[test]
    fn keeps_components_and_says_which_are_not_kept() {
        let dir = std::env::temp_dir().join(format!("meno-ccd-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        keep(&dir, "XYZ", "data_XYZ\n").unwrap();
        let (found, missing) = held(&dir, &["XYZ".into(), "ABC".into()]);
        assert_eq!(found.get("XYZ").map(String::as_str), Some("data_XYZ\n"));
        assert_eq!(missing, vec!["ABC".to_string()]);
        assert!(!dir.join("XYZ.cif.part").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn knows_a_component_file_from_a_page_of_something_else() {
        assert!(is_component("BTN", "# a comment\ndata_BTN\n#\n_chem_comp.id BTN\n"));
        assert!(!is_component("BTN", "<html><body>Not found</body></html>"));
        assert!(!is_component("BTN", "data_BTNX\n"));
    }
}
