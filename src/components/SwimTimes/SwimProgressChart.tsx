import React, { useState } from 'react';
import { SwimDiscipline, SwimTimeEntry } from '../../types';
import { formatSwimTime, getRequirementComparison, isJumpDiscipline, isDiveDiscipline } from '../../lib/swimUtils';
import { Target, TrendingDown, TrendingUp, Award, Calendar, Timer, Info, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  discipline: SwimDiscipline;
  entries: SwimTimeEntry[];
  onAddEntryClick: () => void;
}

export function SwimProgressChart({ discipline, entries, onAddEntryClick }: Props) {
  const [hoveredEntry, setHoveredEntry] = useState<{
    entry: SwimTimeEntry;
    x: number;
    y: number;
    diffPrev?: number;
  } | null>(null);

  const isJump = isJumpDiscipline(discipline);
  const isDive = isDiveDiscipline(discipline);

  // Chronologically sorted entries
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.createdAt - b.createdAt
  );

  if (sortedEntries.length === 0) {
    return (
      <div className="w-full bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-xs">
        <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3 ${
          isJump ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
        }`}>
          {isJump ? <Award size={28} /> : <Timer size={28} />}
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">
          Noch keine Einträge für „{discipline.name}“
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-5">
          {isJump 
            ? 'Dokumentiere deine ersten Sprünge vom 3m Brett inklusive Sprungart und Bewertung.'
            : isDive 
              ? 'Erfasse deine getauchte Strecke (Soll: min. 35m) und optional deine gestoppte Zeit.'
              : 'Erfasse deine erste geschwommene Zeit, um deinen Leistungsverlauf visuell zu verfolgen.'}
        </p>
        <button
          onClick={onAddEntryClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs"
        >
          {isJump ? <Award size={16} /> : <Timer size={16} />}
          <span>{isJump ? 'Ersten Sprung eintragen' : 'Erste Leistung erfassen'}</span>
        </button>
      </div>
    );
  }

  // === JUMP SPECIFIC CARD DISPLAY ===
  if (isJump) {
    return (
      <div className="w-full bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Award size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                Sprungprotokoll & Ausführung
              </h3>
              <p className="text-xs text-slate-500">
                {sortedEntries.length} {sortedEntries.length === 1 ? 'Sprung' : 'Sprünge'} dokumentiert (Prüfungsvorgabe: Kopfsprung einer Sprungart aus 3m Höhe)
              </p>
            </div>
          </div>

          <button
            onClick={onAddEntryClick}
            className="text-xs text-amber-700 hover:text-amber-800 font-bold bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-xl transition-colors self-start sm:self-center"
          >
            + Weiteren Sprung erfassen
          </button>
        </div>

        {/* Quick cards grid of jump history */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedEntries.slice(-6).reverse().map((entry) => (
            <div 
              key={entry.id} 
              className="p-3.5 rounded-2xl border border-amber-200/80 bg-linear-to-br from-amber-50/40 to-orange-50/20 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-amber-200/80 text-amber-900">
                    {entry.jumpHeightMeters || 3}m Höhe
                  </span>
                </div>

                <div className="font-bold text-slate-900 text-sm mb-1">
                  {entry.jumpStyle || 'Kopfsprung'}
                </div>

                {entry.ratingScore && (
                  <div className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 mb-1.5">
                    <CheckCircle2 size={12} />
                    <span>{entry.ratingScore}</span>
                  </div>
                )}
              </div>

              {entry.notes && (
                <div className="text-xs text-slate-600 italic border-t border-amber-100 pt-1.5 mt-1">
                  „{entry.notes}“
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Filter entries with positive time
  const timedEntries = sortedEntries.filter(e => typeof e.timeSeconds === 'number' && e.timeSeconds > 0);

  // If dive without recorded times
  if (isDive && timedEntries.length === 0) {
    return (
      <div className="w-full bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-700 flex items-center justify-center">
              <Target size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                Streckentauchen – Dokumentierte Distanzen
              </h3>
              <p className="text-xs text-slate-500">
                {sortedEntries.length} Taucheinheiten erfasst (Soll: min. 35m)
              </p>
            </div>
          </div>
          <button
            onClick={onAddEntryClick}
            className="text-xs text-cyan-700 hover:text-cyan-800 font-bold bg-cyan-50 hover:bg-cyan-100 px-3 py-2 rounded-xl transition-colors"
          >
            + Neuer Tauchgang
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {sortedEntries.slice(-4).reverse().map(e => (
            <div key={e.id} className="p-3 bg-cyan-50/50 border border-cyan-200 rounded-2xl text-center">
              <div className="text-xs text-slate-500 mb-1">{new Date(e.date).toLocaleDateString('de-DE')}</div>
              <div className="text-xl font-black text-cyan-900">{e.distanceMeters || 35}m</div>
              <div className="text-[11px] font-bold text-emerald-600 mt-0.5">
                {(e.distanceMeters || 35) >= 35 ? '✓ Norm erfüllt' : 'Ausbaufähig'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Chart dimensions & scaling
  const width = 800;
  const height = 320;
  const paddingLeft = 70;
  const paddingRight = 40;
  const paddingTop = 45;
  const paddingBottom = 55;

  const targetSec = discipline.targetTimeSeconds;
  const times = timedEntries.map(e => e.timeSeconds || 0);
  if (targetSec) times.push(targetSec);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  // Add 10% breathing buffer
  const range = maxTime - minTime || 10;
  const yMin = Math.max(0, minTime - range * 0.15);
  const yMax = maxTime + range * 0.15;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const getY = (val: number) => {
    return paddingTop + chartH - ((val - yMin) / (yMax - yMin)) * chartH;
  };

  const getX = (idx: number) => {
    if (timedEntries.length === 1) {
      return paddingLeft + chartW / 2;
    }
    return paddingLeft + (idx / (timedEntries.length - 1)) * chartW;
  };

  // Generate SVG points
  const points = timedEntries.map((e, idx) => ({
    entry: e,
    x: getX(idx),
    y: getY(e.timeSeconds || 0),
    idx
  }));

  // Build path string
  const linePath = points.length === 1
    ? ''
    : points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');

  // Fill area under the line
  const areaPath = points.length > 1
    ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartH} L ${points[0].x} ${paddingTop + chartH} Z`
    : '';

  // Y-Axis ticks (4-5 intervals)
  const numYTicks = 5;
  const yTicks = Array.from({ length: numYTicks }, (_, i) => {
    const val = yMin + (i / (numYTicks - 1)) * (yMax - yMin);
    return {
      val,
      y: getY(val),
      label: formatSwimTime(val, false)
    };
  });

  const targetY = targetSec ? getY(targetSec) : null;

  // Best entry
  const bestEntry = timedEntries.reduce((prev, curr) => (curr.timeSeconds || 0) < (prev.timeSeconds || 0) ? curr : prev, timedEntries[0]);

  return (
    <div className="w-full bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-xs relative">
      {/* Chart Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Timer size={18} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm sm:text-base">
              Fortschrittskurve & Zeitverlauf
            </h3>
            <p className="text-xs text-slate-500">
              {timedEntries.length} {timedEntries.length === 1 ? 'Messung' : 'Messungen'} dokumentiert (niedrigere Kurve = schnellere Zeit)
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-blue-700 font-medium">
            <span className="w-3 h-1 bg-blue-600 rounded-full inline-block"></span>
            <span>Deine Zeiten</span>
          </div>
          {targetSec && (
            <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <span className="w-3.5 h-0.5 border-t-2 border-dashed border-emerald-500 inline-block"></span>
              <span>{isDive ? 'Punkteverbesserung (< 39s)' : `Soll-Norm (${formatSwimTime(targetSec)})`}</span>
            </div>
          )}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          style={{ minHeight: '220px' }}
        >
          <defs>
            <linearGradient id="swimTimeArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
            </linearGradient>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.12" />
            </filter>
          </defs>

          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <g key={`ytick-${i}`}>
              <line
                x1={paddingLeft}
                y1={tick.y}
                x2={width - paddingRight}
                y2={tick.y}
                stroke="#e2e8f0"
                strokeDasharray="4,4"
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 10}
                y={tick.y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#94a3b8"
                fontWeight="500"
                fontFamily="inherit"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Target / Requirement Line */}
          {targetY !== null && targetSec && (
            <g>
              <line
                x1={paddingLeft}
                y1={targetY}
                x2={width - paddingRight}
                y2={targetY}
                stroke="#10b981"
                strokeWidth="2"
                strokeDasharray="6,4"
              />
              <rect
                x={width - paddingRight - 140}
                y={targetY - 11}
                width="140"
                height="20"
                rx="6"
                fill="#ecfdf5"
                stroke="#10b981"
                strokeWidth="1"
              />
              <text
                x={width - paddingRight - 70}
                y={targetY + 3}
                textAnchor="middle"
                fontSize="10"
                fill="#047857"
                fontWeight="700"
                fontFamily="inherit"
              >
                {isDive ? 'Bonus: < 39,00 Sek.' : `Soll: ${formatSwimTime(targetSec, false)}`}
              </text>
            </g>
          )}

          {/* Area fill */}
          {areaPath && (
            <path d={areaPath} fill="url(#swimTimeArea)" />
          )}

          {/* Line connecting points */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Points */}
          {points.map((p, idx) => {
            const isBest = p.entry.id === bestEntry.id;
            const pTime = p.entry.timeSeconds || 0;
            const meetsTarget = targetSec ? pTime <= targetSec : false;
            const isHovered = hoveredEntry?.entry.id === p.entry.id;

            return (
              <g
                key={p.entry.id}
                className="cursor-pointer transition-transform"
                onMouseEnter={() => {
                  const prev = idx > 0 ? timedEntries[idx - 1] : undefined;
                  const diffPrev = prev && prev.timeSeconds ? pTime - prev.timeSeconds : undefined;
                  setHoveredEntry({
                    entry: p.entry,
                    x: p.x,
                    y: p.y,
                    diffPrev
                  });
                }}
                onClick={() => {
                  const prev = idx > 0 ? timedEntries[idx - 1] : undefined;
                  const diffPrev = prev && prev.timeSeconds ? pTime - prev.timeSeconds : undefined;
                  setHoveredEntry({
                    entry: p.entry,
                    x: p.x,
                    y: p.y,
                    diffPrev
                  });
                }}
              >
                {/* Hit area for easy touch */}
                <circle cx={p.x} cy={p.y} r="18" fill="transparent" />

                {/* Outer ring for best time */}
                {isBest && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? '11' : '9'}
                    fill="none"
                    stroke="#eab308"
                    strokeWidth="2.5"
                  />
                )}

                {/* Main dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? '7' : isBest ? '6' : '5'}
                  fill={meetsTarget ? '#10b981' : '#2563eb'}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  filter="url(#shadow)"
                />

                {/* Date label on X-axis */}
                <text
                  x={p.x}
                  y={paddingTop + chartH + 20}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#64748b"
                  fontWeight="600"
                  fontFamily="inherit"
                >
                  {new Date(p.entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover / Tap Tooltip Box */}
        {hoveredEntry && hoveredEntry.entry.timeSeconds && (
          <div
            className="absolute z-10 pointer-events-none transform -translate-x-1/2 -translate-y-full bg-slate-900 text-white rounded-2xl p-3 shadow-xl text-xs max-w-xs transition-all duration-150 border border-slate-700"
            style={{
              left: `${(hoveredEntry.x / width) * 100}%`,
              top: `${Math.max(20, (hoveredEntry.y / height) * 100 - 12)}%`
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-1 pb-1 border-b border-slate-800">
              <span className="font-semibold text-slate-300">
                {new Date(hoveredEntry.entry.date).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })}
              </span>
              {hoveredEntry.entry.id === bestEntry.id && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded-md">
                  <Award size={11} />
                  Bestzeit
                </span>
              )}
            </div>

            <div className="text-base font-extrabold text-blue-300 mb-1">
              {formatSwimTime(hoveredEntry.entry.timeSeconds)}
              {hoveredEntry.entry.distanceMeters && (
                <span className="text-xs font-normal text-slate-300 ml-2">({hoveredEntry.entry.distanceMeters}m)</span>
              )}
            </div>

            {targetSec && (
              <div className="mt-1 pt-1 border-t border-slate-800/80">
                {(() => {
                  const comp = getRequirementComparison(hoveredEntry.entry.timeSeconds || 0, targetSec);
                  return (
                    <div className={`font-semibold flex items-center gap-1 ${comp.isPassed ? 'text-emerald-400' : 'text-amber-400'}`}>
                      <Target size={12} />
                      <span>{comp.isPassed ? '✓ Norm erfüllt: ' : 'Norm verfehlt: '} {comp.formattedDelta}</span>
                    </div>
                  );
                })()}
              </div>
            )}

            {hoveredEntry.diffPrev !== undefined && (
              <div className="mt-1 flex items-center gap-1 text-slate-300">
                {hoveredEntry.diffPrev < 0 ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                    <TrendingDown size={12} />
                    {Math.abs(hoveredEntry.diffPrev).toFixed(2).replace('.', ',')} s schneller
                  </span>
                ) : hoveredEntry.diffPrev > 0 ? (
                  <span className="text-amber-400 font-medium flex items-center gap-0.5">
                    <TrendingUp size={12} />
                    +{hoveredEntry.diffPrev.toFixed(2).replace('.', ',')} s langsamer
                  </span>
                ) : (
                  <span className="text-slate-400">Gleiche Zeit wie zuvor</span>
                )}
                <span className="text-slate-500">zum Vorwert</span>
              </div>
            )}

            {hoveredEntry.entry.notes && (
              <div className="mt-1.5 pt-1 border-t border-slate-800 text-slate-300 italic text-[11px]">
                „{hoveredEntry.entry.notes}“
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center text-xs text-slate-500 gap-2">
        <Info size={14} className="text-blue-500 shrink-0" />
        <span>Bewege die Maus über die Punkte oder tippe darauf, um Zeitdetails und Differenzen einzusehen.</span>
      </div>
    </div>
  );
}
