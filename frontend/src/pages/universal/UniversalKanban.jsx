import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../api';

// Works for Opportunities out of the box (configurable pipeline stages).
// Tickets use their own /kanban endpoint with a fixed status list (see
// backend/routes/tickets.js) — this component renders that shape too, since
// both return { stages/status: [...], cards: [...] } close enough that a
// tiny normalizer below covers both without two separate components.
export default function UniversalKanban() {
  const { moduleApiName } = useParams();
  const navigate = useNavigate();
  const [module, setModule] = useState(null);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragCard, setDragCard] = useState(null);

  const load = async () => {
    const mod = await api.getModuleMeta(moduleApiName);
    setModule(mod);
    const data = await api.kanban(moduleApiName);
    if (Array.isArray(data)) {
      // Tickets shape: [{ status, cards }]
      setColumns(data.map((c) => ({ key: c.status, label: c.status, color: '#6B7280', cards: c.cards })));
    } else {
      // Opportunities shape: { pipeline, stages: [{ stage, cards, total, weighted }] }
      setColumns((data.stages || []).map((s) => ({ key: s.stage.id, label: s.stage.name, color: s.stage.color, cards: s.cards, total: s.total, weighted: s.weighted })));
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [moduleApiName]);

  const onDrop = async (columnKey) => {
    if (!dragCard) return;
    if (moduleApiName === 'opportunities') {
      try { await api.moveOpportunityStage(dragCard.id, columnKey); } catch (err) { alert('Could not move: ' + err.message); }
      load();
    }
    // Tickets: a fixed status list — wire up a status-update call here if you want drag-to-change-status on Tickets too.
    setDragCard(null);
  };

  if (loading) return <div className="py-8 t-meta">Loading…</div>;
  if (!module) return null;

  return (
    <div className="p-8">
      <button onClick={() => navigate(`/records/${module.api_name}`)} className="text-slate-500 hover:text-ink text-sm inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> {module.plural_label} (list)
      </button>
      <h1 className="font-display text-2xl font-semibold text-ink mb-6" style={{ fontFamily: 'var(--font-display)' }}>{module.plural_label} — Kanban</h1>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.key} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(col.key)}
            className="bg-canvas rounded-xl border border-line w-72 shrink-0 flex flex-col">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                <span className="text-sm font-medium text-ink">{col.label}</span>
                <span className="text-xs text-slate-400">({col.cards.length})</span>
              </div>
              {col.total !== undefined && <span className="text-xs text-slate-500">₹{Number(col.total).toLocaleString('en-IN')}</span>}
            </div>
            <div className="p-3 space-y-2 overflow-y-auto flex-1 min-h-[100px]">
              {col.cards.map((card) => (
                <div key={card.id} draggable onDragStart={() => setDragCard(card)}
                  className="bg-white border border-line rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing">
                  <Link to={`/records/${module.api_name}/${card.id}`} className="text-sm font-medium text-ink hover:text-amber block">
                    {card.opportunity_name || card.subject || `#${card.id}`}
                  </Link>
                  {card.account_name && <div className="text-xs text-slate-500 mt-1">{card.account_name}</div>}
                  {card.amount !== undefined && <div className="text-xs text-slate-500 mt-1">₹{Number(card.amount).toLocaleString('en-IN')}</div>}
                </div>
              ))}
              {col.cards.length === 0 && <div className="text-xs text-slate-300 text-center py-4">Drop here</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
