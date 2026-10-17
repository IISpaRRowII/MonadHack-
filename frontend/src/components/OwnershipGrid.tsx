// src/components/OwnershipGrid.tsx
import React, { useMemo } from 'react';
import type { AssetState, Participant } from '../engine/economics';

interface OwnershipGridProps {
  asset: AssetState;
  participants: Record<string, Participant>;
  leaderId: string | null;
}

export const OwnershipGrid: React.FC<OwnershipGridProps> = ({ asset, participants, leaderId }) => {
  const humanUnits = Number(participants['HUMAN']?.holdings[asset.id] || 0n);
  const leaderUnits =
    leaderId && leaderId !== 'HUMAN' ? Number(participants[leaderId]?.holdings[asset.id] || 0n) : 0;
  const totalSupply = Number(asset.totalSupply);
  const otherBotsUnits = Math.max(0, totalSupply - humanUnits - leaderUnits);

  const cells = useMemo(() => {
    const arr: Array<'HUMAN' | 'LEADER_BOT' | 'OTHER_BOT' | 'EMPTY'> = [];
    for (let i = 0; i < 1000; i++) {
      if (i < humanUnits) {
        arr.push('HUMAN');
      } else if (i < humanUnits + leaderUnits) {
        arr.push('LEADER_BOT');
      } else if (i < totalSupply) {
        arr.push('OTHER_BOT');
      } else {
        arr.push('EMPTY');
      }
    }
    return arr;
  }, [humanUnits, leaderUnits, totalSupply]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Mapa de Control de Suministro (Cuadrícula 20 × 50 = 1.000 Unidades)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cada celda representa 1 unidad fungible agregada en circulación para visualizar la distribución del mercado (no son NFTs individuales).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-emerald-400 inline-block shadow-[0_0_6px_#10b981]" />
            Tú ({humanUnits} u.)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-violet-500 inline-block shadow-[0_0_6px_#8b5cf6]" />
            Bot Líder ({leaderUnits} u.)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-blue-500/80 inline-block" />
            Otros Bots ({otherBotsUnits} u.)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-slate-800 border border-slate-700 inline-block" />
            Disponible ({1000 - totalSupply} u.)
          </span>
        </div>
      </div>

      {/* Cuadrícula 50 columnas en escritorio, adaptable en móvil */}
      <div
        className="grid gap-1 p-2 bg-slate-950 rounded-lg border border-slate-800/80 overflow-x-auto"
        style={{
          gridTemplateColumns: 'repeat(50, minmax(8px, 1fr))',
        }}
        role="img"
        aria-label={`Cuadrícula de 1000 unidades de ${asset.name}: ${humanUnits} tuyas, ${leaderUnits} del bot líder, ${otherBotsUnits} de otros bots y ${1000 - totalSupply} disponibles.`}
      >
        {cells.map((status, index) => {
          let bgClass = 'bg-slate-900 border border-slate-800/60';
          if (status === 'HUMAN') {
            bgClass = 'bg-emerald-400 shadow-[0_0_4px_#10b981]';
          } else if (status === 'LEADER_BOT') {
            bgClass = 'bg-violet-500 shadow-[0_0_4px_#8b5cf6]';
          } else if (status === 'OTHER_BOT') {
            bgClass = 'bg-blue-500/75';
          }

          return (
            <div
              key={index}
              title={`Unidad #${index + 1} — ${
                status === 'HUMAN'
                  ? 'Controlada por Ti'
                  : status === 'LEADER_BOT'
                  ? 'Controlada por el Líder'
                  : status === 'OTHER_BOT'
                  ? 'En manos de Bots'
                  : 'Disponible en Curva'
              }`}
              className={`h-2.5 rounded-[2px] transition-colors duration-200 ${bgClass} ${
                index === 500 ? 'ring-1 ring-orange-400' : ''
              }`}
            />
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>Ocupación total: {((totalSupply / 1000) * 100).toFixed(1)}% ({totalSupply}/1.000)</span>
        <span className="text-orange-400 font-medium">
          Meta de Mayoría Absoluta: 501+ unidades (&gt;50% del suministro total)
        </span>
      </div>
    </div>
  );
};