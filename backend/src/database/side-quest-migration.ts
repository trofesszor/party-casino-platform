import type { DatabaseSync } from 'node:sqlite';

const questTable = 'player_side_quests';
const obsoleteQuestTable = 'player_side_quests_old';
const questStatusCheck = /CHECK\s*\(\s*status\s+IN\s*\(\s*'ACTIVE'\s*,\s*'COMPLETED'\s*\)\s*\)/i;
type TableSchema = { name: string; sql: string };

function identifier(name: string) {
  return '"' + name.replace(/"/g, '""') + '"';
}

export function migrateSideQuestTables(sqlite: DatabaseSync) {
  const quests = sqlite.prepare("SELECT name, sql FROM sqlite_schema WHERE type='table' AND name=?")
    .get(questTable) as TableSchema;
  const outdatedStatus = questStatusCheck.test(quests.sql);
  const staleReferences = (sqlite.prepare("SELECT name, sql FROM sqlite_schema WHERE type='table' AND instr(sql, ?) > 0")
    .all(obsoleteQuestTable) as TableSchema[])
    .filter(table => sqlite.prepare('PRAGMA foreign_key_list(' + identifier(table.name) + ')')
      .all().some(key => key.table === obsoleteQuestTable));

  if (outdatedStatus || staleReferences.length) {
    // Suppress rename propagation so the live quest table keeps its foreign-key references.
    const legacy = sqlite.prepare('PRAGMA legacy_alter_table').get()?.legacy_alter_table === 1;
    sqlite.exec('PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON; BEGIN IMMEDIATE');
    try {
      if (outdatedStatus) {
        rebuildTable(sqlite, quests, quests.sql.replace(questStatusCheck, "CHECK(status IN ('ACTIVE','COMPLETED','SKIPPED'))"));
      }
      for (const table of staleReferences) {
        rebuildTable(sqlite, table, table.sql.replace(/\bplayer_side_quests_old\b/g, questTable));
      }
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    } finally {
      sqlite.exec('PRAGMA legacy_alter_table=' + (legacy ? 'ON' : 'OFF') + '; PRAGMA foreign_keys=ON');
    }
  }

  const columns = sqlite.prepare('PRAGMA table_info(player_side_quests)').all();
  if (!columns.some(column => column.name === 'skipped_at')) sqlite.exec('ALTER TABLE player_side_quests ADD COLUMN skipped_at TEXT');
}

function rebuildTable(sqlite: DatabaseSync, table: TableSchema, sql: string) {
  const auxiliary = sqlite.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL")
    .all(table.name) as { sql: string }[];
  const sequence = sqlite.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').get(table.name)?.seq;
  const name = identifier(table.name);
  const temporary = identifier(table.name + '_quest_migration');
  sqlite.exec(`
    ALTER TABLE ${name} RENAME TO ${temporary};
    ${sql};
    INSERT INTO ${name} SELECT * FROM ${temporary};
    DROP TABLE ${temporary};
  `);
  for (const schema of auxiliary) sqlite.exec(schema.sql);
  if (typeof sequence === 'number') {
    const saved = sqlite.prepare('UPDATE sqlite_sequence SET seq=max(seq, ?) WHERE name=?').run(sequence, table.name);
    if (!saved.changes) sqlite.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES (?,?)').run(table.name, sequence);
  }
}
