import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, BrainCircuit, CheckCircle2, ChevronDown, Clock3,
  Cpu, Database, Gauge, LayoutDashboard, ListChecks, LoaderCircle, Menu,
  RefreshCw, ShieldCheck, TrainFront, Wrench, XCircle
} from 'lucide-react';
import { api } from './services/api';
import './App.css';

const NAV = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'planner', label: 'AI block planner', icon: BrainCircuit },
  { id: 'requests', label: 'Maintenance requests', icon: ListChecks },
];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatCard({ icon: Icon, label, value, note }) {
  return <div className="stat-card"><div className="stat-icon"><Icon size={19}/></div><div><p className="stat-label">{label}</p><p className="stat-value">{value}</p><p className="stat-note">{note}</p></div></div>;
}

function StatusPill({ value }) {
  const normalized = String(value || 'Pending').toLowerCase();
  const cls = normalized.includes('approve') || normalized === 'active' ? 'pill green' : normalized.includes('critical') ? 'pill red' : 'pill amber';
  return <span className={cls}>{value || 'Pending'}</span>;
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [requests, setRequests] = useState([]);
  const [assets, setAssets] = useState([]);
  const [trains, setTrains] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [modelStatus, setModelStatus] = useState(null);
  const [selectedId, setSelectedId] = useState('MR003');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);

  const loadData = useCallback(async () => {
    setPageLoading(true);
    setError('');
    try {
      const [reqData, assetData, trainData, blockData, modelData] = await Promise.all([
        api.getMaintenanceRequests(), api.getAssets(), api.getTrains(), api.getBlocks(), api.getModelStatus()
      ]);
      setRequests(reqData || []);
      setAssets(assetData || []);
      setTrains(trainData || []);
      setBlocks(blockData || []);
      setModelStatus(modelData || null);
      setApiOnline(true);
      if (reqData?.length && !reqData.some((r) => r.request_id === selectedId)) setSelectedId(reqData[0].request_id);
    } catch (err) {
      setApiOnline(false);
      setError(`Could not connect to the RailManager backend. ${err.message}`);
    } finally {
      setPageLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { loadData(); }, []); // initial load only

  const selectedRequest = useMemo(() => requests.find((r) => r.request_id === selectedId), [requests, selectedId]);
  const selectedAsset = useMemo(() => assets.find((a) => a.asset_id === selectedRequest?.asset_id), [assets, selectedRequest]);
  const pendingCount = requests.filter((r) => r.status === 'Pending').length;
  const highPriorityCount = requests.filter((r) => r.priority === 'High' && r.status !== 'Approved').length;

  const runRecommendation = async (id = selectedId) => {
    if (!id) return;
    setLoading(true); setError(''); setSuccess(''); setResult(null);
    try {
      const data = await api.getIntelligentPlan(id);
      setResult(data);
      setPage('planner');
    } catch (err) {
      setError(`Recommendation could not be generated: ${err.message}`);
    } finally { setLoading(false); }
  };

  const approveRecommendation = async () => {
    if (!result?.schedule?.recommended_slot || !selectedRequest) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const slot = result.schedule.recommended_slot;
      const blockId = `RM-${Date.now().toString().slice(-7)}`;
      await api.createOrApproveBlock({
        block_id: blockId,
        request_id: selectedRequest.request_id,
        section_id: selectedRequest.section_id,
        asset_id: selectedRequest.asset_id,
        start_time: slot.start_time,
        end_time: slot.end_time,
        date: selectedRequest.requested_date || new Date().toISOString().slice(0, 10),
        status: 'Planned',
        maintenance_team: selectedRequest.created_by || 'Maintenance team',
        approved_by: 'Demo Controller',
        conflicts_avoided: 0,
        expected_delay_min: 0,
        optimization_score: 0,
      });
      setSuccess(`Block ${blockId} saved as Planned. This is a simulated demo approval.`);
      await loadData();
    } catch (err) { setError(`Could not save this block: ${err.message}`); }
    finally { setSaving(false); }
  };

  const changePage = (id) => { setPage(id); setMobileNavOpen(false); setError(''); setSuccess(''); };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-wrap">
        <div className="brand-mark"><TrainFront size={23}/></div>
        <div><div className="brand-name">Rail<span>Manager</span></div><div className="brand-sub">SMART INDIA HACKATHON · SIH26027</div></div>
      </div>
      <div className="topbar-right"><span className={`connection ${apiOnline ? 'online' : 'offline'}`}><i/>{apiOnline ? 'Backend connected' : 'Backend offline'}</span><span className="demo-tag">SIMULATED DEMO DATA</span><button className="icon-button refresh-button" onClick={loadData} title="Refresh data"><RefreshCw size={17}/></button><button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label="Toggle navigation">{mobileNavOpen ? <XCircle size={20}/> : <Menu size={20}/>}</button></div>
    </header>

    <div className="app-body">
      <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <p className="nav-caption">WORKSPACE</p>
        {NAV.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${page === id ? 'active' : ''}`} onClick={() => changePage(id)}><Icon size={18}/><span>{label}</span>{page === id && <span className="nav-active-dot"/>}</button>)}
        <div className="sidebar-bottom"><div className="sidebar-info-icon"><ShieldCheck size={18}/></div><p className="sidebar-info-title">Human approval stays in control</p><p className="sidebar-info-copy">AI suggests a maintenance window. A controller reviews the recommendation before a block is planned.</p></div>
      </aside>

      <main className="main-content">
        {error && <div className="alert error-alert"><XCircle size={18}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
        {success && <div className="alert success-alert"><CheckCircle2 size={18}/><span>{success}</span><button onClick={() => setSuccess('')} aria-label="Dismiss">×</button></div>}

        {pageLoading ? <div className="loading-state"><LoaderCircle className="spin" size={28}/><p>Connecting to RailManager…</p></div> : <>
          {page === 'dashboard' && <Dashboard requests={requests} assets={assets} trains={trains} blocks={blocks} pendingCount={pendingCount} highPriorityCount={highPriorityCount} modelStatus={modelStatus} onPlan={() => changePage('planner')} onRun={(id) => { setSelectedId(id); setResult(null); changePage('planner'); }} onRequests={() => changePage('requests')}/>}
          {page === 'planner' && <Planner requests={requests} selectedId={selectedId} setSelectedId={(id) => { setSelectedId(id); setResult(null); }} selectedRequest={selectedRequest} selectedAsset={selectedAsset} result={result} loading={loading} saving={saving} modelStatus={modelStatus} onRun={() => runRecommendation()} onApprove={approveRecommendation} onViewRequests={() => changePage('requests')}/>}
          {page === 'requests' && <Requests requests={requests} assets={assets} onPlan={(id) => { setSelectedId(id); setResult(null); changePage('planner'); }}/>} 
        </>}
        <footer className="page-footer"><span>RailManager · SIH26027</span><span>Prototype using simulated railway data · Not for live railway operations</span></footer>
      </main>
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action}</div>;
}

function Dashboard({ requests, assets, trains, blocks, pendingCount, highPriorityCount, modelStatus, onPlan, onRun, onRequests }) {
  const latest = requests.slice(0, 4);
  return <>
    <PageHeading eyebrow="CONTROL ROOM / OVERVIEW" title="Maintenance planning overview" description="A single place to review maintenance work and generate an AI-assisted block recommendation." action={<button className="primary-button" onClick={onPlan}><BrainCircuit size={17}/> Open AI planner <ArrowRight size={16}/></button>}/>
    <div className="welcome-panel"><div className="welcome-copy"><span className="welcome-kicker"><Activity size={15}/> RAILWAY MAINTENANCE WORKSPACE</span><h2>Plan maintenance around train movement.</h2><p>RailManager helps prioritize maintenance requests and identify suitable time windows while avoiding scheduled train occupancy.</p><button className="welcome-button" onClick={onPlan}>Generate a block recommendation <ArrowRight size={16}/></button></div><div className="welcome-illustration"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="illustration-core"><TrainFront size={42}/></div><div className="orbit-chip chip-ai"><BrainCircuit size={16}/> AI scoring</div><div className="orbit-chip chip-time"><Clock3 size={16}/> Time window</div><div className="orbit-chip chip-safe"><ShieldCheck size={16}/> Review first</div></div></div>
    <div className="section-title-row"><div><h2>At a glance</h2><p>Current records from the demo database</p></div></div>
    <div className="stats-grid"><StatCard icon={ListChecks} label="Maintenance requests" value={requests.length} note={`${pendingCount} pending review`}/><StatCard icon={AlertTriangleIcon} label="High-priority work" value={highPriorityCount} note="Requires attention"/><StatCard icon={TrainFront} label="Scheduled trains" value={trains.length} note="Across demo sections"/><StatCard icon={Wrench} label="Planned / active blocks" value={blocks.length} note={`${assets.length} tracked assets`}/></div>
    <div className="content-grid dashboard-grid"><section className="panel"><div className="panel-heading"><div><h3>Recent maintenance requests</h3><p>Choose a request to plan a maintenance block</p></div><button className="text-button" onClick={onRequests}>View all <ArrowRight size={15}/></button></div>{latest.length ? <div className="request-list">{latest.map((r) => <div className="request-row" key={r.request_id}><div className="request-symbol"><Wrench size={17}/></div><div className="request-main"><strong>{r.request_id} · {r.maintenance_type}</strong><span>{r.asset_id} · Section {r.section_id} · {r.required_duration}h</span></div><div className="request-meta"><StatusPill value={r.status}/><button className="small-outline-button" onClick={() => onRun(r.request_id)}>Plan</button></div></div>)}</div> : <EmptyState text="No maintenance requests found."/>}</section>
      <section className="panel process-panel"><div className="panel-heading"><div><h3>How RailManager works</h3><p>Three simple steps</p></div><span className="step-count">01 — 03</span></div><div className="process-steps"><ProcessStep number="01" icon={Database} title="Select maintenance request" detail="Use asset, priority and required work duration."/><ProcessStep number="02" icon={BrainCircuit} title="AI evaluates urgency" detail="XGBoost estimates a criticality score from request features."/><ProcessStep number="03" icon={Clock3} title="CP-SAT finds a time slot" detail="Checks train occupancy and existing blocks before recommending a window."/></div><div className="process-footnote"><ShieldCheck size={16}/> A controller remains responsible for approval.</div></section></div>
    <div className="data-note"><span className="note-icon"><Activity size={17}/></span><div><strong>Demonstration environment</strong><p>This prototype currently uses simulated railway records and a model trained on synthetic labels. It is not connected to live Indian Railways systems.</p></div><span className={`model-indicator ${modelStatus?.trained ? 'ready' : 'not-ready'}`}>{modelStatus?.trained ? 'Model file found' : 'Model unavailable'}</span></div>
  </>;
}

function AlertTriangleIcon(props) { return <Gauge {...props}/>; }
function ProcessStep({ number, icon: Icon, title, detail }) { return <div className="process-step"><span className="process-number">{number}</span><span className="process-icon"><Icon size={18}/></span><div><strong>{title}</strong><p>{detail}</p></div></div>; }

function Planner({ requests, selectedId, setSelectedId, selectedRequest, selectedAsset, result, loading, saving, modelStatus, onRun, onApprove, onViewRequests }) {
  const criticality = result?.criticality;
  const schedule = result?.schedule;
  const slot = schedule?.recommended_slot;
  return <>
    <PageHeading eyebrow="AI WORKSPACE / BLOCK PLANNER" title="AI block planner" description="Select one maintenance request. The system scores its urgency and searches for a feasible maintenance window."/>
    <div className="planner-layout"><section className="panel planner-input-panel"><div className="panel-heading"><div><h3>1. Select maintenance work</h3><p>Choose the request that needs a block</p></div><span className="step-badge">INPUT</span></div>
      {requests.length ? <><label className="field-label" htmlFor="request-select">Maintenance request</label><div className="select-wrap"><select id="request-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>{requests.map((r) => <option key={r.request_id} value={r.request_id}>{r.request_id} — {r.maintenance_type}</option>)}</select><ChevronDown size={17}/></div>
      {selectedRequest ? <div className="selected-request-card"><div className="selected-topline"><span className="request-id-tag">{selectedRequest.request_id}</span><StatusPill value={selectedRequest.priority + ' priority'}/></div><h4>{selectedRequest.maintenance_type}</h4><div className="detail-pairs"><div><span>Asset</span><strong>{selectedAsset?.name || selectedRequest.asset_id}</strong></div><div><span>Asset ID</span><strong>{selectedRequest.asset_id}</strong></div><div><span>Railway section</span><strong>{selectedRequest.section_id}</strong></div><div><span>Required duration</span><strong>{selectedRequest.required_duration} hours</strong></div><div><span>Request status</span><strong>{selectedRequest.status}</strong></div><div><span>Requested</span><strong>{formatDate(selectedRequest.requested_date)}</strong></div></div></div> : null}
      <button className="primary-button run-button" onClick={onRun} disabled={!selectedRequest || loading}><BrainCircuit size={18}/>{loading ? 'Analysing request…' : 'Generate AI recommendation'}{loading ? <LoaderCircle size={17} className="spin"/> : <ArrowRight size={17}/>}</button>
      <p className="button-caption">Runs XGBoost criticality scoring and OR-Tools CP-SAT scheduling.</p></> : <EmptyState text="No maintenance requests available." actionLabel="Refresh data"/>}
      <div className="engine-status"><div className="engine-status-row"><span className="engine-dot"/><span>XGBoost model</span><strong>{modelStatus?.trained ? 'Available' : 'Not found'}</strong></div><div className="engine-status-row"><span className="engine-dot"/><span>CP-SAT scheduler</span><strong>Configured</strong></div></div>
    </section>
    <section className="panel result-panel"><div className="panel-heading"><div><h3>2. AI recommendation</h3><p>Results from the selected maintenance request</p></div><span className="step-badge result-badge">RESULT</span></div>
      {!result && !loading && <div className="empty-result"><div className="empty-result-icon"><BrainCircuit size={30}/></div><h3>Your recommendation will appear here</h3><p>Select a maintenance request and click “Generate AI recommendation”. The result will include a criticality score and a recommended time window.</p><button className="secondary-button" onClick={onViewRequests}>View maintenance requests</button></div>}
      {loading && <div className="loading-result"><LoaderCircle className="spin" size={30}/><strong>Analysing timetable and maintenance urgency</strong><p>Checking train occupancy, existing blocks and the required work duration…</p></div>}
      {result && <div className="result-content"><div className="result-status-row"><span className={`status-large ${schedule?.status === 'OPTIMAL' ? 'good' : 'caution'}`}><CheckCircle2 size={16}/>{schedule?.status || result.status || 'COMPLETED'}</span><span className="result-request">Request {result.request_id}</span></div>
        <div className="score-row"><div className="score-circle"><strong>{Math.round(criticality?.criticality_score ?? 0)}</strong><span>/100</span></div><div className="score-copy"><span className="eyebrow">XGBOOST CRITICALITY SCORE</span><h3>{criticality?.priority_band || 'Not scored'} priority</h3><p>Estimated maintenance urgency based on the available demo request and asset features.</p></div></div>
        <div className="recommended-slot"><div className="recommended-heading"><span><Clock3 size={17}/> RECOMMENDED MAINTENANCE WINDOW</span><span className="recommended-tag">CP-SAT</span></div>{slot ? <><div className="slot-time">{slot.start_time}<span>—</span>{slot.end_time}</div><p>{slot.duration_minutes ? `${(slot.duration_minutes / 60).toFixed(1)} hours of maintenance time` : 'Maintenance duration'} · Section {schedule.section_id}</p></> : <div className="no-slot"><XCircle size={18}/> No feasible slot found for the current demo constraints.</div>}</div>
        <div className="result-facts"><div><span>Feasible windows</span><strong>{schedule?.candidate_count ?? '—'}</strong></div><div><span>Solver</span><strong>OR-Tools CP-SAT</strong></div><div><span>Train conflicts</span><strong>Excluded by constraints</strong></div></div>
        {schedule?.constraints?.length ? <div className="why-panel"><strong>What the scheduler checked</strong><ul>{schedule.constraints.map((c) => <li key={c}><CheckCircle2 size={14}/>{c}</li>)}</ul></div> : null}
        <div className="explanation-panel"><strong>Why this request received its score</strong><ul>{(criticality?.explanation || []).map((line) => <li key={line}>{line}</li>)}</ul></div>
        {criticality?.data_warning && <div className="warning-note"><span>Important demo limitation</span>{criticality.data_warning}</div>}
        {schedule?.data_note && <p className="data-footnote">{schedule.data_note}</p>}
        {slot && <button className="approve-button" onClick={onApprove} disabled={saving || selectedRequest?.status === 'Approved'}>{saving ? <LoaderCircle className="spin" size={17}/> : <ShieldCheck size={17}/>} {saving ? 'Saving planned block…' : selectedRequest?.status === 'Approved' ? 'Request already approved' : 'Controller: save as planned block'}</button>}
      </div>}
    </section></div>
  </>;
}

function Requests({ requests, assets, onPlan }) {
  const assetMap = useMemo(() => Object.fromEntries(assets.map((a) => [a.asset_id, a])), [assets]);
  return <><PageHeading eyebrow="WORKSPACE / MAINTENANCE" title="Maintenance requests" description="Review the demo maintenance queue and send a request to the AI block planner." action={<span className="count-chip">{requests.length} total requests</span>}/><section className="panel requests-panel"><div className="panel-heading"><div><h3>Request queue</h3><p>Priority, asset and required work duration</p></div></div>{requests.length ? <div className="table-wrap"><table><thead><tr><th>Request</th><th>Maintenance work</th><th>Asset</th><th>Section</th><th>Duration</th><th>Priority</th><th>Status</th><th/></tr></thead><tbody>{requests.map((r) => <tr key={r.request_id}><td><strong className="table-id">{r.request_id}</strong><small>{formatDate(r.requested_date)}</small></td><td>{r.maintenance_type}</td><td>{assetMap[r.asset_id]?.name || r.asset_id}<small>{r.asset_id}</small></td><td>{r.section_id}</td><td>{r.required_duration}h</td><td><StatusPill value={r.priority}/></td><td><StatusPill value={r.status}/></td><td><button className="small-outline-button" onClick={() => onPlan(r.request_id)}>Plan <ArrowRight size={13}/></button></td></tr>)}</tbody></table></div> : <EmptyState text="No maintenance requests found."/>}</section><div className="data-note"><span className="note-icon"><Database size={17}/></span><div><strong>Where does this data come from?</strong><p>These records are loaded from the project's local demo database, populated with sample railway sections, trains, assets and maintenance requests.</p></div></div></>;
}

function EmptyState({ text, actionLabel, onAction }) { return <div className="empty-state"><p>{text}</p>{actionLabel && <button className="text-button" onClick={onAction}>{actionLabel}</button>}</div>; }
