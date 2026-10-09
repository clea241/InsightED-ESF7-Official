#!/usr/bin/env bash
# Read-only grep scan: prints file:line hits for persistence-related references. No DB access, no writes.
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT" || exit 1

scan() {
  grep -rnE \
    --exclude-dir=node_modules --exclude-dir=backups --exclude-dir=coverage --exclude-dir=dist --exclude-dir=.git \
    --exclude='*.bak_*' --exclude=package-lock.json \
    --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' --include='*.cjs' --include='*.mjs' --include='*.sql' \
    -e "$1" server client/src 2>/dev/null || true
}
section() { printf '\n## %s\n' "$1"; }

section "school_drafts (SQL and code)"
scan 'school_drafts'
section "draft routes and handlers"
scan "/draft'|/draft\"|handleSaveDraft|handleGetDraft|saveSchoolDraft|loadSchoolDraft"
section "draft payload reads/writes"
scan 'payload->|payload ->|finalPayload'
section "room roster cache fallback"
scan 'esf7_room_roster_cache'
section "derived sync after draft"
scan 'syncDraftToNodeStatus'
section "bulk workload / section / personnel saves"
scan "router\.(post|put)\('/(bulk|personnel)|saveWorkloadBatchHandler|savePersonnelChanges"
section "normalized table references"
scan 'esf7_(school_profile|personnel_profile|personnel_employment|perssonel_educ|personnel_designations|regular_sections|sned_sections|als_sections|workload_rows|admin_task|related_task|school_node_status)'
exit 0
