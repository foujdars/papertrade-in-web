"use client";
import { ChartColorControl } from './ChartColorControl';

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CandlestickChart, Check, ChevronRight, Copy, LayoutTemplate, Paintbrush, RotateCcw, Save, Scaling, Trash2, X } from "lucide-react";
import { chartCanvasPalette } from "@/lib/desktop-chart-theme";
import { chartStyleLabel, type ChartStyleId } from "@/lib/chart-style";
import { DEFAULT_DESKTOP_CHART_SETTINGS, MAX_CHART_TEMPLATES, normalizeDesktopChartSettings, resolveDesktopChartColors, type DesktopChartSettings } from "@/lib/desktop-chart-settings";
import { useChartAppearanceTemplates, useDesktopChartSettings } from "@/lib/desktop-chart-preferences";
import { ChartDialogPortal } from "./ChartDialogPortal";
import { useTouchChart } from "@/lib/use-touch-chart";
import { useTransientBack } from "./useTransientBack";

const TABS = [
  { id: "symbol", label: "Symbol", icon: CandlestickChart },
  { id: "scales", label: "Scales and lines", icon: Scaling },
  { id: "canvas", label: "Canvas", icon: Paintbrush },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
] as const;
type Tab = typeof TABS[number]["id"];
const STROKES = [{ value: 0, label: "Solid" }, { value: 1, label: "Dotted" }, { value: 2, label: "Dashed" }, { value: 3, label: "Large dashes" }];

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="desktop-settings-row"><div><span>{label}</span>{hint && <small>{hint}</small>}</div><div className="desktop-settings-field">{children}</div></div>;
}
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="desktop-settings-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}{hint && <small>{hint}</small>}</span></label>;
}
function Color({ label, value, fallback, onChange }: { label: string; value: string | null; fallback: string; onChange: (value: string | null) => void }) {
  return <div className="desktop-settings-color"><label title={label}><ChartColorControl label={label} value={value ?? fallback} onChange={onChange} /><span>{value?.toUpperCase() ?? "Auto"}</span></label><button type="button" title={`Reset ${label.toLowerCase()} to automatic`} aria-label={`Reset ${label.toLowerCase()}`} disabled={value === null} onClick={() => onChange(null)}><RotateCcw size={12} /></button></div>;
}

export function DesktopChartSettingsDialog({ onClose, theme = "light", symbol = "Chart", chartStyle = "candles", palette }: {
  onClose: () => void;
  theme?: "light" | "neon";
  symbol?: string;
  chartStyle?: ChartStyleId;
  palette?: ReturnType<typeof chartCanvasPalette>;
}) {
  return <ChartDialogPortal><SettingsDialog palette={palette ?? chartCanvasPalette(theme, { mediaMatches: true, platform: "web", section: "trade", native: false })} onClose={onClose} theme={theme} symbol={symbol} chartStyle={chartStyle} /></ChartDialogPortal>;
}

function SettingsDialog({ onClose, theme, symbol, chartStyle, palette }: Required<Parameters<typeof DesktopChartSettingsDialog>[0]>) {
  const touch=useTouchChart();
  const [settings, setSettings, settingsPersistence] = useDesktopChartSettings();
  const [templates, setTemplates, templatesPersistence] = useChartAppearanceTemplates();
  const [draft, setDraft] = useState<DesktopChartSettings>(() => ({ ...settings }));
  const [tab, setTab] = useState<Tab>("symbol");
  const [templateName, setTemplateName] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const prefix = useId();
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const colors = resolveDesktopChartColors(draft, palette);
  const sameName = templates.find((item) => item.name.toLocaleLowerCase() === templateName.trim().toLocaleLowerCase());
  const unsaved = [settingsPersistence === "session-only" ? "chart settings" : "", templatesPersistence === "session-only" ? "templates" : ""].filter(Boolean).join(" and ");
  useTransientBack(true, onClose);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    node.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
    return () => { node.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const change = <K extends keyof DesktopChartSettings>(key: K, value: DesktopChartSettings[K]) => {
    setDraft((current) => normalizeDesktopChartSettings({ ...current, [key]: value }));
    setNotice("");
  };
  function apply(close: boolean) {
    const saved = setSettings(draft);
    setNotice(saved ? "Chart settings applied and saved." : "Chart settings applied for this session only.");
    if (close && saved && templatesPersistence === "saved") onClose();
  }
  function saveTemplate() {
    const name = templateName.trim().slice(0, 48);
    if (!name || (!sameName && templates.length >= MAX_CHART_TEMPLATES)) return;
    const id = sameName?.id ?? `chart-${crypto.randomUUID()}`;
    const entry = { id, name, savedAt: Date.now(), settings: { ...draft } };
    const saved = setTemplates((current) => [entry, ...current.filter((item) => item.id !== id)]);
    setTemplateName("");
    setNotice(saved ? `${name} ${sameName ? "updated" : "saved"} on this device.` : `${name} is available for this session only. Saving to this device failed.`);
  }
  const color = (key: keyof Pick<DesktopChartSettings, "upColor" | "downColor" | "wickUpColor" | "wickDownColor" | "borderUpColor" | "borderDownColor" | "lineColor" | "backgroundColor" | "textColor" | "gridColor" | "crosshairColor">, label: string, fallback: string) => <Color label={label} value={draft[key]} fallback={fallback} onChange={(value) => change(key, value)} />;
  return <dialog ref={dialog} className="desktop-chart-settings" data-theme={theme} aria-labelledby={`${prefix}-title`} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()} onPointerDown={(event) => { event.stopPropagation(); if (event.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header className="desktop-settings-header"><div><h2 id={`${prefix}-title`}>Chart settings</h2><span>{symbol} <ChevronRight size={12} /> {chartStyleLabel(chartStyle)}</span></div><button type="button" aria-label="Close chart settings" onClick={onClose}><X size={20} /></button></header>
    <div className="desktop-settings-body">
      <nav role="tablist" aria-label="Chart settings sections" aria-orientation={touch ? "horizontal" : "vertical"} className="desktop-settings-tabs" onKeyDown={(event) => {
        const index = TABS.findIndex((item) => item.id === tab);
        const next = (event.key === "ArrowDown" || event.key === "ArrowRight") ? (index + 1) % TABS.length : (event.key === "ArrowUp" || event.key === "ArrowLeft") ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); setTab(TABS[next].id); document.getElementById(`${prefix}-tab-${TABS[next].id}`)?.focus();
      }}>{TABS.map(({ id, label, icon: Icon }) => <button type="button" role="tab" id={`${prefix}-tab-${id}`} aria-controls={`${prefix}-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} key={id} onClick={() => setTab(id)}><Icon size={18} /><span>{label}</span></button>)}<small>CHART WORKSPACE</small></nav>
      <div className="desktop-settings-content" role="tabpanel" id={`${prefix}-panel-${tab}`} aria-labelledby={`${prefix}-tab-${tab}`} tabIndex={0}>
        {tab === "symbol" && <>
          <div className="desktop-settings-preview" style={{ background: colors.background, color: colors.text }} aria-label="Candle color preview"><span>Candle appearance</span><svg viewBox="0 0 160 58" role="img" aria-label="Preview of up and down candles">{[0, 1, 2, 3, 4, 5].map((index) => { const up = index % 3 !== 1, x = 12 + index * 26, y = 12 + (index % 3) * 5; return <g key={index}>{draft.wickVisible && <line x1={x + 5} x2={x + 5} y1={y - 7} y2={y + 30} stroke={up ? colors.wickUp : colors.wickDown} />}<rect x={x} y={y} width="10" height="21" fill={up ? colors.up : colors.down} stroke={draft.borderVisible ? up ? colors.borderUp : colors.borderDown : "none"} /></g>; })}</svg><small>Preview · Apply to update chart</small></div>
          <h3>Candles and bars</h3>
          <Row label="Body" hint="Up / down">{color("upColor", "Up candle color", palette.up)}{color("downColor", "Down candle color", palette.down)}</Row>
          <Row label="Wicks"><Toggle label="Show wicks" checked={draft.wickVisible} onChange={(value) => change("wickVisible", value)} /></Row>
          <Row label="Wick colors" hint="Up / down">{color("wickUpColor", "Up wick color", colors.up)}{color("wickDownColor", "Down wick color", colors.down)}</Row>
          <Row label="Borders"><Toggle label="Show borders" checked={draft.borderVisible} onChange={(value) => change("borderVisible", value)} /></Row>
          <Row label="Border colors" hint="Up / down">{color("borderUpColor", "Up border color", colors.up)}{color("borderDownColor", "Down border color", colors.down)}</Row>
          <h3>Line and area charts</h3>
          <Row label="Line color">{color("lineColor", "Chart line color", palette.accent)}</Row>
          <Row label="Line width"><select aria-label="Chart line width" value={draft.lineWidth} onChange={(event) => change("lineWidth", Number(event.target.value) as DesktopChartSettings["lineWidth"])}>{[1, 2, 3, 4].map((width) => <option value={width} key={width}>{width} px</option>)}</select></Row>
          <p className="desktop-settings-help">Candle controls apply to candle charts. Bar charts use body colors; line and area charts use the line settings.</p>
        </>}
        {tab === "scales" && <>
          <h3>Price scale</h3>
          <Row label="Scale mode"><select aria-label="Price scale mode" value={draft.scaleMode} onChange={(event) => change("scaleMode", event.target.value as DesktopChartSettings["scaleMode"])}><option value="normal">Regular</option><option value="log">Logarithmic</option><option value="percent">Percentage</option><option value="indexed">Indexed to 100</option></select></Row>
          <Toggle label="Auto scale" hint="Fit the visible prices into the chart." checked={draft.autoScale} onChange={(value) => change("autoScale", value)} />
          <Toggle label="Invert scale" hint="Display higher prices at the bottom." checked={draft.invertScale} onChange={(value) => change("invertScale", value)} />
          <Row label="Top margin"><label className="desktop-settings-number"><input aria-label="Top scale margin" type="number" min={0} max={40} value={draft.scaleMarginTop} onChange={(event) => change("scaleMarginTop", Number(event.target.value))} /><span>%</span></label></Row>
          <Row label="Bottom margin"><label className="desktop-settings-number"><input aria-label="Bottom scale margin" type="number" min={0} max={40} value={draft.scaleMarginBottom} onChange={(event) => change("scaleMarginBottom", Number(event.target.value))} /><span>%</span></label></Row>
          <h3>Price labels and lines</h3>
          <Toggle label="Last price label" checked={draft.lastValueVisible} onChange={(value) => change("lastValueVisible", value)} />
          <Toggle label="Last price line" checked={draft.priceLineVisible} onChange={(value) => change("priceLineVisible", value)} />
          <h3>Time scale</h3>
          <Toggle label="Show time on intraday charts" checked={draft.timeVisible} onChange={(value) => change("timeVisible", value)} />
          <Toggle label="Include seconds" checked={draft.secondsVisible} onChange={(value) => change("secondsVisible", value)} />
          <Row label="Right margin" hint="Space after the latest candle"><label className="desktop-settings-number"><input aria-label="Right margin in bars" type="number" min={0} max={100} value={draft.rightOffset} onChange={(event) => change("rightOffset", Number(event.target.value))} /><span>bars</span></label></Row>
        </>}
        {tab === "canvas" && <>
          <h3>Appearance</h3>
          <Row label="Background">{color("backgroundColor", "Chart background color", palette.background)}</Row>
          <Row label="Scale text">{color("textColor", "Chart text color", palette.text)}</Row>
          <p className="desktop-settings-help">Automatic colors follow the app theme. Custom colors stay the same in light and dark themes.</p>
          <h3>Grid</h3>
          <Toggle label="Vertical grid lines" checked={draft.verticalGrid} onChange={(value) => change("verticalGrid", value)} />
          <Toggle label="Horizontal grid lines" checked={draft.horizontalGrid} onChange={(value) => change("horizontalGrid", value)} />
          <Row label="Grid color">{color("gridColor", "Chart grid color", palette.grid)}</Row>
          <Row label="Grid line style"><select aria-label="Grid line style" value={draft.gridStyle} onChange={(event) => change("gridStyle", Number(event.target.value) as DesktopChartSettings["gridStyle"])}>{STROKES.map((stroke) => <option key={stroke.value} value={stroke.value}>{stroke.label}</option>)}</select></Row>
          <h3>Crosshair</h3>
          <Toggle label="Show crosshair" checked={draft.crosshairVisible} onChange={(value) => change("crosshairVisible", value)} />
          <Row label="Crosshair color">{color("crosshairColor", "Crosshair color", palette.crosshair)}</Row>
          <Row label="Crosshair line style"><select aria-label="Crosshair line style" value={draft.crosshairStyle} onChange={(event) => change("crosshairStyle", Number(event.target.value) as DesktopChartSettings["crosshairStyle"])}>{STROKES.map((stroke) => <option key={stroke.value} value={stroke.value}>{stroke.label}</option>)}</select></Row>
        </>}
        {tab === "templates" && <>
          <h3>Save your chart appearance</h3>
          <p className="desktop-settings-help">Templates contain the settings in this dialog. They do not include drawings, indicators, symbol, or interval.</p>
          <div className="desktop-settings-template-save"><label htmlFor={`${prefix}-template-name`}>Template name</label><div><input id={`${prefix}-template-name`} value={templateName} maxLength={48} placeholder="My chart appearance" onChange={(event) => setTemplateName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveTemplate(); } }} /><button type="button" disabled={!templateName.trim() || (!sameName && templates.length >= MAX_CHART_TEMPLATES)} onClick={saveTemplate}><Save size={15} />{sameName ? "Update" : "Save"}</button></div><small>{templates.length} of {MAX_CHART_TEMPLATES} templates · {templatesPersistence === "saved" ? "Saved on this device" : "Session only · Saving failed"}</small>{templatesPersistence === "session-only" && <button type="button" className="desktop-settings-retry" onClick={() => { const saved = setTemplates((current) => current); setNotice(saved ? "Templates saved on this device." : "Could not save templates. They remain available for this session only."); }}><Save size={14} />Retry saving templates</button>}</div>
          <div className="desktop-settings-template-list">{templates.length ? templates.map((item) => <div key={item.id}><LayoutTemplate size={18} /><span><b>{item.name}</b><small>{item.savedAt ? new Date(item.savedAt).toLocaleDateString() : "Saved appearance"}</small></span><button type="button" aria-label={`Load ${item.name} template`} onClick={() => { setDraft({ ...item.settings }); setNotice(`${item.name} loaded. Apply to update the chart.`); }}><Copy size={14} />Load</button><button type="button" aria-label={`Delete ${item.name} template`} onClick={() => { const saved = setTemplates((current) => current.filter((template) => template.id !== item.id)); setNotice(saved ? `${item.name} deleted.` : `${item.name} removed for this session only. Saving the deletion failed.`); }}><Trash2 size={15} /></button></div>) : <div className="desktop-settings-templates-empty"><LayoutTemplate size={30} /><b>No saved templates</b><p>Save the current settings to reuse your preferred chart appearance.</p></div>}</div>
        </>}
      </div>
    </div>
    <div className={`desktop-settings-notice${unsaved ? " is-storage-error" : ""}`} role={unsaved ? "alert" : "status"}>{unsaved ? `Could not save ${unsaved}. Changes are available for this session only. ${settingsPersistence === "session-only" ? "Select Apply to retry chart settings. " : ""}${templatesPersistence === "session-only" ? "Retry saving from Templates." : ""}` : notice ? <><Check size={13} />{notice}</> : dirty ? "Unapplied changes" : "Settings apply to charts and are saved on this device."}</div>
    <footer className="desktop-settings-footer"><button type="button" className="desktop-settings-reset" onClick={() => { setDraft({ ...DEFAULT_DESKTOP_CHART_SETTINGS }); setNotice("Defaults loaded. Apply to update the chart."); }}><RotateCcw size={14} />Defaults</button><div><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={!dirty && settingsPersistence === "saved"} onClick={() => apply(false)}>Apply</button><button type="button" className="desktop-settings-confirm" onClick={() => apply(true)}>OK</button></div></footer>
  </dialog>;
}
