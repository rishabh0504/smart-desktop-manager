use serde::{Serialize, Deserialize};


#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub has_children: bool,
}

#[tauri::command]
pub fn get_tree_nodes(path: String) -> Result<Vec<TreeNode>, String> {
    let dir_path = std::path::Path::new(&path);
    if !dir_path.exists() {
        return Err("Directory does not exist".to_string());
    }

    let mut nodes = Vec::new();
    let entries = std::fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                
                // Fast check for children (only directories count for the tree)
                let has_children = std::fs::read_dir(&path)
                    .map(|mut it| it.any(|e| e.map(|entry| entry.path().is_dir()).unwrap_or(false)))
                    .unwrap_or(false);

                nodes.push(TreeNode {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: true,
                    has_children,
                });
            }
        }
    }

    // Sort folders alphabetically
    nodes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(nodes)
}
