# 05 — Lead Dashboard

## Goal
Provide a fast, filterable, and actionable list view of all leads in the workspace, with bulk actions and quick status updates.

---

## Features

- Paginated lead table (50 per page, server-side)
- Search by name, email, company
- Filter by: status, batch, assigned rep, date range
- Sort by: name, status, company, created date, last activity
- Bulk actions: change status, assign to rep, add to batch, delete
- Quick inline status update (click status badge)
- "My Leads" toggle (rep-scoped view)
- Column visibility toggle
- CSV export of current filtered view
- Lead count by status (summary bar)
- Click row to open lead detail

---

## Database Tables

Primary: `leads`, `lead_batches`, `workspace_members`

**Key query pattern**:
```sql
SELECT
  l.*,
  wm.full_name AS assigned_name,
  lb.name AS batch_name,
  (SELECT MAX(created_at) FROM emails WHERE lead_id = l.id) AS last_emailed_at,
  (SELECT MAX(created_at) FROM activity_logs WHERE lead_id = l.id) AS last_activity_at
FROM leads l
LEFT JOIN workspace_members wm ON l.assigned_to = wm.user_id
  AND wm.workspace_id = l.workspace_id
LEFT JOIN lead_batches lb ON l.batch_id = lb.id
WHERE l.workspace_id = $1
  AND l.deleted_at IS NULL
  AND ($2::lead_status IS NULL OR l.status = $2)
  AND ($3::uuid IS NULL OR l.batch_id = $3)
  AND ($4::uuid IS NULL OR l.assigned_to = $4)
ORDER BY l.created_at DESC
LIMIT 50 OFFSET $5;
```

---

## API Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/leads` | List leads with filters + pagination | rep+ |
| POST | `/api/leads` | Create single lead | rep+ |
| PATCH | `/api/leads/bulk` | Bulk update (status, assign, batch) | rep+ |
| DELETE | `/api/leads/bulk` | Bulk delete | manager+ |
| GET | `/api/leads/export` | CSV export of current filter | rep+ |
| GET | `/api/leads/summary` | Status counts for current filter | rep+ |

### Query Parameters for `GET /api/leads`
```
?status=new
&batch_id=uuid
&assigned_to=uuid
&search=john
&sort_by=created_at
&sort_dir=desc
&page=1
&per_page=50
&my_leads=true
```

### `PATCH /api/leads/bulk`
```ts
Request: {
  lead_ids: string[],
  action: 'status' | 'assign' | 'add_to_batch' | 'remove_from_batch',
  value: string  // status value, user_id, or batch_id
}
```

---

## UI Components

### `<LeadDashboardPage>`
Top-level page component — server component that fetches initial data.

### `<LeadStatusBar>`
Horizontal bar showing lead counts per status:
```
New (124) | Contacted (56) | Replied (12) | Interested (8) | ...
```
Clicking a status chip filters the table.

### `<LeadFilters>`
Collapsible filter panel:
- Search input (debounced 300ms)
- Status multi-select
- Batch dropdown
- Assigned to dropdown (admin/manager see all reps; rep sees self only)
- Date range picker (created_at)
- "My Leads" toggle switch
- Clear filters button

### `<LeadTable>`
Columns:
| Column | Sortable | Notes |
|---|---|---|
| Checkbox | — | Select for bulk actions |
| Name | ✓ | Links to lead detail |
| Email | — | |
| Company | ✓ | |
| Status | ✓ | Inline badge with click-to-edit dropdown |
| Batch | — | |
| Assigned To | — | Admin+ sees others |
| Last Activity | ✓ | Relative time (e.g., "2h ago") |
| Actions | — | Quick email button, view button |

### `<BulkActionBar>` (appears when rows selected)
- Shows "X leads selected"
- Buttons: Change Status, Assign To, Add to Batch, Delete
- Confirm modal for delete

### `<LeadTableRow>`
- Status badge is a `<Select>` component — changing it fires PATCH inline
- "Send Email" icon button opens `<ComposeEmailModal>` pre-filled with lead

### `<CreateLeadModal>`
Form fields: first name, last name, email (required), company, title, phone, website, batch selector.

### `<ColumnVisibilityMenu>`
Dropdown to show/hide optional columns (phone, website, source, etc.)

---

## Server Component Data Fetching Pattern

```tsx
// app/(dashboard)/leads/page.tsx
export default async function LeadsPage({ searchParams }) {
  const supabase = createServerClient();
  const { data: leads, count } = await supabase
    .from('leads')
    .select('*, lead_batches(name)', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  return <LeadTable initialData={leads} totalCount={count} />;
}
```

Client-side filter changes use `useRouter().push()` to update URL search params, triggering a server re-render.

---

## URL State Pattern

Filters are serialised into URL search params for shareability and browser history:
```
/leads?status=new&batch_id=abc&page=2&sort_by=created_at&sort_dir=desc
```

---

## Performance Considerations

- Server-side pagination (never load all leads to client)
- Indexes on `workspace_id`, `status`, `batch_id`, `assigned_to`, `deleted_at`
- Status count query is a separate lightweight `COUNT(*)` query grouped by status
- Search uses `ILIKE` on indexed columns (email, first_name, last_name, company)
- CSV export is streamed via a Response with Content-Disposition header, not buffered

---

## Implementation Order

1. Build `GET /api/leads` with pagination, filters, sort
2. Build `GET /api/leads/summary` for status counts
3. Build `<LeadTable>` with static columns (no filters yet)
4. Add `<LeadFilters>` with URL param sync
5. Add `<LeadStatusBar>` component
6. Add inline status edit (PATCH single lead)
7. Build `<BulkActionBar>` + `PATCH /api/leads/bulk`
8. Build `<CreateLeadModal>` + `POST /api/leads`
9. Add CSV export (`GET /api/leads/export`)
10. Add column visibility toggle

---

## Testing Checklist

- [ ] Lead list loads with correct data for workspace
- [ ] RLS: reps only see their own workspace's leads
- [ ] "My Leads" toggle filters to assigned_to = current user
- [ ] Status filter returns correct results
- [ ] Search matches name, email, and company
- [ ] Pagination works correctly at boundaries (page 1, last page)
- [ ] Bulk status change updates all selected leads
- [ ] Bulk delete requires manager+ role (UI hidden for reps, API 403)
- [ ] Inline status badge update reflects immediately in UI
- [ ] CSV export contains all filtered leads (not just current page)
- [ ] Sort by last activity works correctly

---

## AI Model Guidance

- **No AI needed** for list/filter/sort logic.
- **GPT-4o-mini** can be used for a future "Smart Filter" feature: natural language query → structured filter params (e.g., "show me all interested leads from last week not yet followed up").
