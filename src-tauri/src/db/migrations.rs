/// Returns all migration SQL statements in order.
/// Each tuple is (version, description, sql).
pub fn get_migrations() -> Vec<(i32, &'static str, &'static str)> {
    vec![(1, "Initial schema", include_str!("../../migrations/001_initial.sql"))]
}
