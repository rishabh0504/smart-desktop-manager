use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;
use lazy_static::lazy_static;

lazy_static! {
    pub static ref OPERATIONS: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>> = 
        Arc::new(Mutex::new(HashMap::new()));
}

#[tauri::command]
pub async fn cancel_operation(operation_id: String) {
    let ops = OPERATIONS.lock().unwrap();
    if let Some(cancel_flag) = ops.get(&operation_id) {
        cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

pub fn register_operation(operation_id: String) -> Arc<AtomicBool> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let mut ops = OPERATIONS.lock().unwrap();
    ops.insert(operation_id, cancel_flag.clone());
    cancel_flag
}

pub fn unregister_operation(operation_id: &str) {
    let mut ops = OPERATIONS.lock().unwrap();
    ops.remove(operation_id);
}
