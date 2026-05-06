import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceCollide } from 'd3-force-3d';
import type { FleetGraph, FleetNode } from '../types/fleet';
import { getAnimations, hasActiveAnimations } from '../lib/nodeAnimations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGInstance = any;

const ZOOM_LEVEL: Record<string, number> = {
  'homebase':            1.8,
  'station-controller':  3.5,
  'game-kiosk':          6,
  'info-kiosk':          6,
};

export interface FleetGraphHandle {
  zoomToNode: (id: string) => void;
  reheat: () => void;
}

interface Props {
  graph: FleetGraph;
  onNodeSelect: (node: FleetNode | null) => void;
  selectedNodeId?: string;
}

const FleetGraph = forwardRef<FleetGraphHandle, Props>(function FleetGraph({ graph, onNodeSelect, selectedNodeId }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<FGInstance>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const charge = -60;
  const manualZoom = useRef(false);

  useImperativeHandle(ref, () => ({
    zoomToNode(id: string) {
      // graph.nodes are mutated in-place by d3-force — same objects, live x/y
      const node = (graph.nodes as Array<FleetNode & { x?: number; y?: number }>)
        .find(n => n.id === id);
      if (node?.x == null) return;
      manualZoom.current = true;
      fgRef.current?.centerAt(node.x, node.y!, 600);
      fgRef.current?.zoom(ZOOM_LEVEL[node.role] ?? 3, 600);
    },
    reheat() {
      fgRef.current?.d3ReheatSimulation();
    },
  }), [graph.nodes]);
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
      return src === 'homebase' ? 38 : 22;
    });
    fgRef.current.d3Force('collide', forceCollide((node: FleetNode) => Math.sqrt(node.val) * 3 + 10));
    fgRef.current.d3ReheatSimulation();
  }, [graph.nodes.length]);

  // Zoom to fit when selection is cleared
  useEffect(() => {
    if (!selectedNodeId) {
      manualZoom.current = false;
      fgRef.current?.zoomToFit(600, 10);
    }
  }, [selectedNodeId]);

  // Drive canvas repaints while node animations are running
  useEffect(() => {
    let rafId: number;
    function tick() {
      if (hasActiveAnimations()) fgRef.current?.refresh();
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graph}
        warmupTicks={600}
        cooldownTime={800}
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
        linkColor={(link) => {
          const t = graph.nodes.find(n => n.id === ((link.target as FleetNode & {id:string}).id ?? link.target));
          if (t?.status === 'dead')    return '#f8717133';
          if (t?.alerting)             return '#fb923c33';
          return '#ffffff22';
        }}
        linkCurvature={0.15}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={(link) => {
          const t = graph.nodes.find(n => n.id === ((link.target as FleetNode & {id:string}).id ?? link.target));
          if (t?.status === 'dead')    return 0.0002;
          if (t?.alerting)             return 0.0006;
          return 0.0015;
        }}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleColor={(link) => {
          const t = graph.nodes.find(n => n.id === ((link.target as FleetNode & {id:string}).id ?? link.target));
          if (t?.status === 'dead')    return '#f87171aa';
          if (t?.alerting)             return '#fb923caa';
          return '#4ade8055';
        }}
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
          const isDimmed = !!selectedNodeId && !isSelected;
          const isKiosk = n.role === 'game-kiosk' || n.role === 'info-kiosk';
          const radius = Math.sqrt(n.val) * 3;

          // Blend a hex color toward the dark background for true dimming (no transparency)
          const dim = (hex: string, t = 0.35): string => {
            const c = parseInt(hex.slice(1), 16);
            const r = Math.round(((c >> 16) & 0xff) * t);
            const g = Math.round(((c >>  8) & 0xff) * t);
            const b = Math.round(( c        & 0xff) * t);
            return `rgb(${r},${g},${b})`;
          };

          const now  = Date.now();
          const anims = getAnimations(n.id);

          // Chaos shockwave — two expanding red rings
          for (const anim of anims.filter(a => a.type === 'chaos-shockwave')) {
            const p = Math.min(1, (now - anim.startedAt) / (anim.durationMs ?? 1500));
            const r1 = radius + (p * 48) / globalScale;
            const a1 = 0.85 * (1 - p);
            if (a1 > 0) {
              ctx.beginPath();
              ctx.arc(n.x, n.y, r1, 0, 2 * Math.PI);
              ctx.strokeStyle = `rgba(248,113,113,${a1})`;
              ctx.lineWidth = 2.5 / globalScale;
              ctx.stroke();
            }
            const p2 = Math.max(0, p - 0.18);
            const r2 = radius + (p2 * 48) / globalScale;
            const a2 = 0.5 * Math.max(0, 1 - p / 0.85);
            if (a2 > 0) {
              ctx.beginPath();
              ctx.arc(n.x, n.y, r2, 0, 2 * Math.PI);
              ctx.strokeStyle = `rgba(248,113,113,${a2})`;
              ctx.lineWidth = 1.5 / globalScale;
              ctx.stroke();
            }
          }

          // Recovery burst — three cascading green rings
          for (const anim of anims.filter(a => a.type === 'recovery-burst')) {
            const p = Math.min(1, (now - anim.startedAt) / (anim.durationMs ?? 2000));
            for (let i = 0; i < 3; i++) {
              const pi = Math.max(0, p - i * 0.14);
              const r  = radius + (pi * 56) / globalScale;
              const a  = 0.8 * (1 - pi);
              if (a <= 0) continue;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
              ctx.strokeStyle = `rgba(74,222,128,${a})`;
              ctx.lineWidth = (2.5 - i * 0.6) / globalScale;
              ctx.stroke();
            }
          }

          // Alerting ring (orange pulse)
          if (n.alerting) {
            const pulse = 0.4 + 0.4 * Math.sin(now / 350);
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius + 7 / globalScale, 0, 2 * Math.PI);
            ctx.strokeStyle = `rgba(251,146,60,${pulse})`;
            ctx.lineWidth = 2.5 / globalScale;
            ctx.stroke();
          }

          // Fireman pulse — blue beating ring while recovery is in progress
          if (anims.some(a => a.type === 'fireman-pulse')) {
            const pulse = 0.35 + 0.45 * Math.sin(now / 400);
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius + 9 / globalScale, 0, 2 * Math.PI);
            ctx.strokeStyle = `rgba(96,165,250,${pulse})`;
            ctx.lineWidth = 2.5 / globalScale;
            ctx.stroke();
          }

          if (isSelected) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius + 5 / globalScale, 0, 2 * Math.PI);
            ctx.strokeStyle = '#ffffff55';
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = isDimmed ? dim(n.color) : n.color;
          ctx.fill();
          ctx.strokeStyle = isDimmed ? dim(n.color, 0.45) : isSelected ? '#ffffff' : n.color;
          ctx.lineWidth = (isSelected ? 2 : 1.5) / globalScale;
          ctx.stroke();

          if (globalScale > 1.2 || n.role === 'homebase' || n.role === 'station-controller') {
            const fontSize = Math.max(isKiosk ? 5 : 6, (isKiosk ? 8 : 10) / globalScale);
            ctx.font = `${fontSize}px monospace`;
            ctx.fillStyle = isDimmed ? '#1e293b' : '#f1f5f9';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.name, n.x, n.y);
          }
        }}
        nodeCanvasObjectMode={() => 'replace'}
      />

    </div>
  );
});

export default FleetGraph;
