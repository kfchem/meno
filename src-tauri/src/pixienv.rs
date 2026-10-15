//! Python environments pixi makes - a plugin's, where it needs conda-forge
//! (docs/PLUGINS.md) - beside those uv makes. An environment is made from
//! the manifest and the lock in the plugin's folder, copied into the app's
//! local data folder (lib.rs `local_data_dir`), `pixi/plugin-<id>/`, where pixi
//! keeps the environment it makes (`.pixi/envs/default`); everything else
//! pixi keeps - its cache, its home - is there too, and no configuration of
//! the user's is read.
//!
//! A conda environment expects to be activated: on Windows its libraries
//! are found only on the PATH activation sets. What activation sets is
//! asked of pixi once, as the environment is made (`shell-hook --json`),
//! and kept beside it (`activation.json`): the variables, and the folders
//! put before the PATH. A worker started in the environment is given them.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;

/// What stands in for the PATH when activation is asked for: what comes
/// before it is the environment's own.
const PATH_MARK: &str = "MENO_PATH_BEFORE_ACTIVATION";

/// What activation sets, as kept beside an environment.
#[derive(Serialize, Deserialize, Debug, Default, PartialEq)]
pub struct Activation {
    /// Every variable but the PATH.
    pub vars: BTreeMap<String, String>,
    /// The folders put before the PATH, in order.
    pub path: Vec<String>,
}

/// A command running pixi with everything it keeps under the app's data
/// folder, and deaf to the user's pixi configuration.
pub fn pixi_command(pixi: &Path, data: &Path) -> Command {
    let mut cmd = Command::new(pixi);
    cmd.env("PIXI_CACHE_DIR", data.join("pixi").join("cache"))
        .env("PIXI_HOME", data.join("pixi").join("home"))
        .env("PIXI_NO_CONFIG", "1");
    cmd
}

/// `pixi install` for an environment, from its lock as it is.
pub fn install_command(pixi: &Path, data: &Path, manifest: &Path) -> Command {
    let mut cmd = pixi_command(pixi, data);
    cmd.arg("install").arg("--frozen").arg("--manifest-path").arg(manifest);
    cmd
}

/// `pixi shell-hook --json` for an environment, `PATH_MARK` put before the
/// PATH - not in its place: pixi runs the activation scripts in a shell it
/// finds on the PATH.
pub fn activation_command(pixi: &Path, data: &Path, manifest: &Path) -> Command {
    let mut cmd = pixi_command(pixi, data);
    let sep = if cfg!(windows) { ";" } else { ":" };
    let path = match std::env::var("PATH") {
        Ok(was) if !was.is_empty() => format!("{PATH_MARK}{sep}{was}"),
        _ => PATH_MARK.to_string(),
    };
    cmd.arg("shell-hook")
        .arg("--json")
        .arg("--frozen")
        .arg("--manifest-path")
        .arg(manifest)
        .env("PATH", path);
    cmd
}

/// What `shell-hook --json` says activation sets, read: the PATH's own
/// folders - those before `PATH_MARK` - and every other variable.
pub fn read_activation(json: &str) -> Result<Activation, String> {
    #[derive(Deserialize)]
    struct Hook {
        environment_variables: BTreeMap<String, String>,
    }
    let hook: Hook = serde_json::from_str(json).map_err(|e| format!("pixi's activation: {e}"))?;
    let mut out = Activation::default();
    for (k, v) in hook.environment_variables {
        if k.eq_ignore_ascii_case("PATH") {
            let sep = if v.contains(';') { ';' } else { ':' };
            out.path = v
                .split(sep)
                .take_while(|p| *p != PATH_MARK)
                .filter(|p| !p.is_empty())
                .map(str::to_string)
                .collect();
        } else if !v.contains(PATH_MARK) {
            out.vars.insert(k, v);
        }
    }
    Ok(out)
}

/// Where an environment's activation is kept.
pub fn activation_path(env_dir: &Path) -> PathBuf {
    env_dir.join("activation.json")
}

/// Gives a command an environment's activation: its variables, and its
/// folders before the PATH it would have had.
pub fn activate(cmd: &mut Command, activation: &Activation) {
    for (k, v) in &activation.vars {
        cmd.env(k, v);
    }
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut path = activation.path.join(sep);
    if let Ok(was) = std::env::var("PATH") {
        if !was.is_empty() {
            path = if path.is_empty() { was } else { format!("{path}{sep}{was}") };
        }
    }
    cmd.env("PATH", path);
}

/// The environment folder an interpreter of a pixi environment is in -
/// `<pixi root>/<name>` - where the interpreter is within `root`; none,
/// where it is not.
pub fn env_dir_of(entry: &Path, root: &Path) -> Option<PathBuf> {
    let rel = entry.strip_prefix(root).ok()?;
    let name = rel.components().next()?;
    Some(root.join(name))
}

/// What pixi keeps for the environments it makes under `root`
/// (`<data>/pixi`) - its cache, its home - where none is left there:
/// nothing else uses them.
pub fn unused_keeping(root: &Path) -> Vec<PathBuf> {
    const KEEPING: [&str; 2] = ["cache", "home"];
    let env_left = std::fs::read_dir(root)
        .map(|entries| {
            entries.filter_map(Result::ok).any(|e| {
                let name = e.file_name();
                e.path().is_dir() && !KEEPING.iter().chain(&["stamps"]).any(|k| name == *k)
            })
        })
        .unwrap_or(false);
    if env_left {
        return Vec::new();
    }
    KEEPING.iter().map(|k| root.join(k)).filter(|p| p.exists()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn pixi_keeps_everything_under_the_app_data_and_reads_no_configuration_of_the_users() {
        let data = Path::new("/data/Meno");
        let cmd = install_command(Path::new("/data/Meno/tools/pixi/0.81.0/pixi"), data, Path::new("/data/Meno/pixi/plugin-pyscf/pixi.toml"));
        let envs: HashMap<_, _> = cmd.get_envs().map(|(k, v)| (k.to_owned(), v.map(|v| v.to_owned()))).collect();
        let get = |k: &str| envs.get(std::ffi::OsStr::new(k)).cloned().flatten();
        assert_eq!(get("PIXI_CACHE_DIR"), Some(data.join("pixi").join("cache").into_os_string()));
        assert_eq!(get("PIXI_HOME"), Some(data.join("pixi").join("home").into_os_string()));
        assert_eq!(get("PIXI_NO_CONFIG"), Some("1".into()));
        let args: Vec<_> = cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(args, ["install", "--frozen", "--manifest-path", "/data/Meno/pixi/plugin-pyscf/pixi.toml"]);
    }

    #[test]
    fn activation_is_asked_for_with_the_mark_before_the_path_pixi_finds_its_shell_on() {
        let cmd = activation_command(Path::new("pixi"), Path::new("/data/Meno"), Path::new("/data/Meno/pixi/x/pixi.toml"));
        let path = cmd.get_envs().find(|(k, _)| *k == "PATH").and_then(|(_, v)| v).unwrap().to_string_lossy().into_owned();
        assert!(path.starts_with(PATH_MARK));
        if let Ok(was) = std::env::var("PATH") {
            assert!(path.ends_with(&was));
        }
    }

    #[test]
    fn activation_is_read_as_its_variables_and_the_folders_before_the_path() {
        let unix = r#"{"environment_variables": {
            "PATH": "/d/pixi/x/.pixi/envs/default/bin:MENO_PATH_BEFORE_ACTIVATION",
            "CONDA_PREFIX": "/d/pixi/x/.pixi/envs/default",
            "PIXI_PROJECT_NAME": "meno-reader-pyscf"
        }, "activation_scripts": []}"#;
        let a = read_activation(unix).unwrap();
        assert_eq!(a.path, ["/d/pixi/x/.pixi/envs/default/bin"]);
        assert_eq!(a.vars.get("CONDA_PREFIX").map(String::as_str), Some("/d/pixi/x/.pixi/envs/default"));
        assert!(!a.vars.contains_key("PATH"));
        let windows = r#"{"environment_variables": {
            "Path": "C:\\d\\env;C:\\d\\env\\Library\\bin;C:\\d\\env\\Scripts;MENO_PATH_BEFORE_ACTIVATION"
        }}"#;
        assert_eq!(read_activation(windows).unwrap().path, ["C:\\d\\env", "C:\\d\\env\\Library\\bin", "C:\\d\\env\\Scripts"]);
        assert!(read_activation("not json").is_err());
    }

    #[test]
    fn a_command_is_given_the_activation_before_its_own_path() {
        let a = Activation { vars: BTreeMap::from([("CONDA_PREFIX".into(), "/env".into())]), path: vec!["/env/bin".into()] };
        let mut cmd = Command::new("python");
        activate(&mut cmd, &a);
        let envs: HashMap<_, _> = cmd.get_envs().map(|(k, v)| (k.to_string_lossy().into_owned(), v.map(|v| v.to_string_lossy().into_owned()))).collect();
        assert_eq!(envs.get("CONDA_PREFIX").cloned().flatten().as_deref(), Some("/env"));
        assert!(envs.get("PATH").cloned().flatten().unwrap().starts_with("/env/bin"));
    }

    #[test]
    fn what_pixi_keeps_goes_with_the_last_environment() {
        let root = std::env::temp_dir().join(format!("meno-pixi-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        for d in ["cache", "home", "stamps", "plugin-a", "plugin-b"] {
            std::fs::create_dir_all(root.join(d)).unwrap();
        }
        assert!(unused_keeping(&root).is_empty());
        std::fs::remove_dir_all(root.join("plugin-a")).unwrap();
        assert!(unused_keeping(&root).is_empty());
        std::fs::remove_dir_all(root.join("plugin-b")).unwrap();
        assert_eq!(unused_keeping(&root), [root.join("cache"), root.join("home")]);
        std::fs::remove_dir_all(root.join("home")).unwrap();
        assert_eq!(unused_keeping(&root), [root.join("cache")]);
        std::fs::remove_dir_all(&root).unwrap();
        assert!(unused_keeping(&root).is_empty());
    }

    #[test]
    fn an_interpreter_is_known_by_its_environment() {
        let root = Path::new("/data/Meno/pixi");
        assert_eq!(env_dir_of(Path::new("/data/Meno/pixi/plugin-pyscf/.pixi/envs/default/bin/python"), root), Some(root.join("plugin-pyscf")));
        assert_eq!(env_dir_of(Path::new("/data/Meno/uv/chem/venv/bin/python"), root), None);
    }
}
