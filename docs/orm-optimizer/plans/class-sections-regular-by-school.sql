-- params: ["SCH-302669","302669"]
-- database: esf7_local
SELECT * FROM esf7_regular_sections WHERE school_id = $1 OR school_id = $2 ORDER BY grade_level ASC, section_name ASC;
