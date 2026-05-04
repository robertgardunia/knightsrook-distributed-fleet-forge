import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { FleetGraph, FleetNode } from '../types/fleet';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGInstance = any;

const ZOOM_LEVEL: Record<string, number> = {
  'homebase':            1.8,
  'station-controller':  3.5,
  'game-kiosk':          6,
  'info-kiosk':          6,
};

interface Props {
  graph: FleetGraph;
  onNodeSelect: (node: FleetNode | null) => void;
  selectedNodeId?: string;
}

export default function FleetGraph({ graph, onNodeSelect, selectedNodeId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<FGInstance>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [charge, setCharge] = useState(-120);
  const manualZoom = useRef(false);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
      if (!manualZoom.current) fgRef.current?.zoomToFit(200, 10);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => { document.body.style.cursor = 'default'; };
  }, []);

  // Tune forces whenever graph data or charge changes
  useEffect(() => {
    if (!graph.nodes.length || !fgRef.current) return;
    fgRef.current.d3Force('charge').strength(charge);
    fgRef.current.d3Force('link').distance((link: { source: { id?: string } | string }) => {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      return src === 'homebase' ? 80 : 40;
    });
    fgRef.current.d3ReheatSimulation();
  }, [graph.nodes.length, charge]);

  // Zoom to fit when selection is cleared
  useEffect(() => {
    if (!selectedNodeId) {
      manualZoom.current = false;
      fgRef.current?.zoomToFit(600, 10);
    }
  }, [selectedNodeId]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graph}
        warmupTicks={400}
        cooldownTime={3000}
        onEngineStop={() => {
          if (!manualZoom.current) fgRef.current?.zoomToFit(400, 10);
        }}
        width={dimensions.width}
        height={dimensions.height}
        nodeVal={(node) => (node as unknown as FleetNode).val}
        nodeColor={(node) => (node as unknown as FleetNode).color}
        nodeLabel={(node) => {
          const n = node as unknown as FleetNode;
          return `${n.name} · ${n.role} · ${n.status}`;
        }}
        linkColor={() => '#ffffff22'}
        linkCurvature={0.3}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.0015}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleColor={() => '#4ade8055'}
        backgroundColor="#0f172a"
        onNodeClick={(node) => {
          const n = node as unknown as FleetNode & { x: number; y: number };
          manualZoom.current = true;
          fgRef.current?.centerAt(n.x, n.y, 600);
          fgRef.current?.zoom(ZOOM_LEVEL[n.role] ?? 3, 600);
          onNodeSelect(n);
        }}
        onNodeHover={(node) => { document.body.style.cursor = node ? 'pointer' : 'default'; }}
        onBackgroundClick={() => {
          manualZoom.current = false;
          fgRef.current?.zoomToFit(600, 10);
          onNodeSelect(null);
        }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as unknown as FleetNode & { x: number; y: number };
          const isSelected = n.id === selectedNodeId;
          const radius = Math.sqrt(n.val) * 3;

          if (isSelected) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius + 5 / globalScale, 0, 2 * Math.PI);
            ctx.strokeStyle = '#ffffff55';
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = n.color + 'cc';
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#ffffff' : n.color;
          ctx.lineWidth = (isSelected ? 2 : 1.5) / globalScale;
          ctx.stroke();

          if (globalScale > 1.2 || n.role === 'homebase' || n.role === 'station-controller') {
            const fontSize = Math.max(6, 10 / globalScale);
            ctx.font = `${fontSize}px monospace`;
            ctx.fillStyle = '#f1f5f9';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.name, n.x, n.y);
          }
        }}
        nodeCanvasObjectMode={() => 'replace'}
      />

      {/* Force tuning overlay */}
      <div style={{
        position: 'absolute', bottom: 10, left: 10,
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#0d1f3599', backdropFilter: 'blur(4px)',
        border: '1px solid #1e293b', borderRadius: 4,
        padding: '4px 10px', pointerEvents: 'auto',
      }}>
        <span style={{ color: '#475569', fontSize: '0.6rem', letterSpacing: '0.08em', userSelect: 'none' }}>CHARGE</span>
        <input
          type="range" min={-400} max={100} step={5}
          value={charge}
          onChange={e => setCharge(Number(e.target.value))}
          style={{ width: 90, accentColor: '#4ade80', cursor: 'pointer' }}
        />
        <span style={{ color: '#64748b', fontSize: '0.6rem', width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{charge}</span>
      </div>
    </div>
  );
}
