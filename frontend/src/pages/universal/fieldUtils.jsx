// Shared helpers for the universal list/detail pages. Not a page itself.

// Given a field's metadata and a record, read its current value.
// - is_system fields on a table-backed module: read directly off the record
// - non-system fields on a table-backed module: not returned by the
//   dedicated list/detail routes today (they live in custom_field_values,
//   fetched separately via the /custom-fields endpoint) — returns undefined
// - fields on a custom (JSON-backed) module: read off record.data
export function getFieldValue(record, field) {
  if (!record) return undefined;
  if (field.is_system) return record[field.api_name];
  if (record.data) return record.data[field.api_name];
  return record[field.api_name];
}

export function formatFieldValue(value, field) {
  if (value === undefined || value === null || value === '') return '—';
  if (field.field_type === 'checkbox') return value ? 'Yes' : 'No';
  if (field.field_type === 'currency') return `₹${Number(value).toLocaleString('en-IN')}`;
  if (field.field_type === 'percent') return `${value}%`;
  if (field.field_type === 'date') return String(value).slice(0, 10);
  if (field.field_type === 'datetime') return String(value).replace('T', ' ').slice(0, 16);
  if (field.field_type === 'multiselect') return Array.isArray(value) ? value.join(', ') : value;
  return String(value);
}

export function parseOptions(field) {
  try { return JSON.parse(field.options_json || '[]'); } catch { return []; }
}

const inputClass = 'border border-line rounded-lg px-3 py-2 text-sm w-full';

// Renders the right input widget for a field's type. `value`/`onChange`
// follow the usual controlled-input contract.
export function FieldInput({ field, value, onChange }) {
  const opts = parseOptions(field);

  if (field.field_type === 'dropdown' || field.field_type === 'radio') {
    return (
      <select className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (field.field_type === 'multiselect') {
    const arr = Array.isArray(value) ? value : [];
    return (
      <select multiple className={inputClass} value={arr}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (field.field_type === 'checkbox') {
    return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />;
  }
  if (field.field_type === 'textarea' || field.field_type === 'rich_text') {
    return <textarea className={inputClass} rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  if (['number', 'decimal', 'currency', 'percent'].includes(field.field_type)) {
    return <input type="number" step="any" className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
  }
  if (field.field_type === 'date') {
    return <input type="date" className={inputClass} value={value ? String(value).slice(0, 10) : ''} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.field_type === 'datetime') {
    return <input type="datetime-local" className={inputClass} value={value ? String(value).slice(0, 16) : ''} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.field_type === 'email') return <input type="email" className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  if (field.field_type === 'url') return <input type="url" className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  if (field.field_type === 'phone') return <input type="tel" className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  return <input type="text" className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

// Best-effort "what's the title of this record" — used in list rows, page
// headers, and related-record chips, across every module without hardcoding
// a per-module field name.
export function recordTitle(record, fields) {
  if (!record) return '';
  if (record.record_name) return record.record_name; // custom-module records always have this
  const nameField = fields.find((f) => ['name', 'title', 'subject'].some((k) => f.api_name.includes(k)))
    || fields.find((f) => f.required) || fields[0];
  if (!nameField) return `#${record.id}`;
  const v = getFieldValue(record, nameField);
  return v || `#${record.id}`;
}
