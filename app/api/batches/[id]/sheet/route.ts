/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/utils/api'

interface Params {
  params: Promise<{ id: string }>
}

function parseCsv(text: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  return parsed.data ?? []
}

function parseXlsx(buffer: ArrayBuffer): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[firstSheetName]
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: '',
    raw: false,
  })
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id: batchId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiUnauthorized()

    const admin = createAdminClient()

    const { data: member } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!member) return apiUnauthorized()

    if (!['admin', 'super_admin'].includes(member.role)) {
      return apiError('Access denied', 403)
    }

    const { data: batch } = await (admin as any)
      .from('lead_batches')
      .select('id, name')
      .eq('id', batchId)
      .eq('workspace_id', member.workspace_id)
      .single()

    if (!batch) return apiError('Batch not found', 404)

    const { data: importRecord } = await (admin as any)
      .from('lead_imports')
      .select('id, file_name, storage_path, created_at')
      .eq('workspace_id', member.workspace_id)
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!importRecord?.storage_path) {
      return apiSuccess({
        batch,
        headers: [],
        rows: [],
        hasOriginalSheet: false,
      })
    }

    const { data: fileData, error: fileErr } = await admin.storage
      .from('lead-imports')
      .download(importRecord.storage_path)

    if (fileErr || !fileData) return apiServerError(fileErr)

    const lowerPath = String(importRecord.storage_path).toLowerCase()
    let rows: Record<string, string>[] = []

    if (lowerPath.endsWith('.xlsx') || lowerPath.endsWith('.xls')) {
      const buf = await fileData.arrayBuffer()
      rows = parseXlsx(buf)
    } else {
      const text = await fileData.text()
      rows = parseCsv(text)
    }

    const headers = rows.length > 0
      ? Object.keys(rows[0])
      : []

    return apiSuccess({
      batch,
      headers,
      rows: rows.slice(0, 500),
      hasOriginalSheet: true,
      truncated: rows.length > 500,
      totalRows: rows.length,
      importFileName: importRecord.file_name,
    })
  } catch (err) {
    return apiServerError(err)
  }
}
