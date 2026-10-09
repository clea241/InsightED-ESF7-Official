-- Read-only inventory of esf7_* tables (plus school_drafts). Run through run_inventory.js (guarded). SELECT only.
SELECT 'columns' AS kind, c.table_name, c.ordinal_position AS pos, c.column_name AS name,
       c.data_type || COALESCE('(' || c.character_maximum_length || ')', '') AS detail, c.is_nullable AS extra
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND (c.table_name LIKE 'esf7\_%' OR c.table_name = 'school_drafts')
UNION ALL
SELECT 'constraint', tc.table_name, 0, tc.constraint_name, tc.constraint_type, NULL
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public' AND (tc.table_name LIKE 'esf7\_%' OR tc.table_name = 'school_drafts')
UNION ALL
SELECT 'foreign_key', kcu.table_name, 0, kcu.column_name || ' -> ' || ccu.table_name || '(' || ccu.column_name || ')', tc.constraint_name, NULL
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY 1, 2, 3, 4;
